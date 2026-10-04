from pathlib import Path
import asyncio
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from main import app
from analysis import analyze, demo_events
import recommendations as rec

client = TestClient(app)
samples = Path(__file__).resolve().parents[1] / "samples"


@pytest.fixture(autouse=True)
def default_rules(monkeypatch):
    monkeypatch.setenv("RECOMMENDER", "rules")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    rec.api_requests.clear()


def test_demo_and_capture():
    assert client.get("/api/health").json()["status"] == "ok"
    report = client.get("/api/demo").json()
    assert report["source"] == "demo"
    assert report["feedback_source"] == "Rules"
    r, p = demo_events()
    response = client.post("/api/capture", json={"reference": r, "performance": p})
    assert response.status_code == 200
    assert len(response.json()["notes"]) == 32


def test_midi_upload_and_reference():
    with (samples / "reference.mid").open("rb") as ref, (
        samples / "performance.mid"
    ).open("rb") as perf:
        response = client.post(
            "/api/analyze",
            files={
                "reference": ("reference.mid", ref),
                "performance": ("performance.mid", perf),
            },
        )
    assert response.status_code == 200, response.text
    assert response.json()["pitch_score"] == 88
    assert len(response.json()["sections"]) == 8
    with (samples / "reference.mid").open("rb") as ref:
        score = client.post(
            "/api/reference", files={"reference": ("reference.mid", ref)}
        ).json()
    assert len(score["notes"]) == 32
    assert score["measures"][1]["start"] == 2


def test_invalid_input():
    assert (
        client.post(
            "/api/capture", json={"reference": [], "performance": []}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/analyze",
            files={
                "reference": ("bad.txt", b"bad"),
                "performance": ("bad.mid", b"bad"),
            },
        ).status_code
        == 422
    )
    r, p = demo_events()
    r[0]["start"] = float("inf")
    assert (
        client.post(
            "/api/capture", content=json.dumps({"reference": r, "performance": p})
        ).status_code
        == 422
    )


def test_audio_upload():
    with (samples / "reference.mid").open("rb") as ref, (
        samples / "performance.wav"
    ).open("rb") as perf:
        response = client.post(
            "/api/analyze",
            files={
                "reference": ("reference.mid", ref),
                "performance": ("performance.wav", perf),
            },
        )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["source"] == "audio"
    assert 20 <= report["performance_count"] <= 35
    assert not report["assessment_limited"], report["polyphony_ratio"]
    assert report["pitch_score"] >= 70
    assert all(
        0 <= n["confidence"] <= 1
        for n in report["notes"]
        if n["confidence"] is not None
    )
    assert report["audio_confidence"] > 0


def test_limits_declared_and_streamed(monkeypatch):
    monkeypatch.setenv("MAX_REQUEST_MB", "1")
    assert (
        client.post(
            "/api/capture",
            headers={"Content-Length": str(2 * 1024 * 1024)},
            content=b"{}",
        ).status_code
        == 413
    )
    response = client.post("/api/capture", content=iter([b"x" * (600 * 1024)] * 2))
    assert response.status_code == 413


def fake_provider(monkeypatch, payload, provider, status=200):
    original = httpx.AsyncClient
    seen = []

    def handle(request):
        body = json.loads(request.content)
        summary = json.loads(
            body["prompt"] if provider == "ollama" else body["messages"][1]["content"]
        )
        seen.append(summary)
        assert "notes" not in summary and "reference" not in summary
        content = (
            {"response": json.dumps(payload)}
            if provider == "ollama"
            else {"choices": [{"message": {"content": json.dumps(payload)}}]}
        )
        return httpx.Response(status, json=content)

    monkeypatch.setattr(
        rec.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    return seen


@pytest.mark.parametrize("provider", ["ollama", "api"])
def test_provider_success_and_bad_measures(monkeypatch, provider):
    monkeypatch.setenv("RECOMMENDER", provider)
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    recommendations = [
        dict(
            title="Bar 3: repeat",
            body="Play slowly.",
            reason="There are missed notes here.",
            measures=[3],
        )
        for _ in range(3)
    ]
    payload = {"recommendations": recommendations}
    seen = fake_provider(monkeypatch, payload, provider)
    report = asyncio.run(rec.recommend(analyze(*demo_events())))
    assert report["feedback_source"] in ["Ollama", "Hosted API"]
    assert seen
    payload["recommendations"][0]["measures"] = [999]
    report = asyncio.run(rec.recommend(analyze(*demo_events())))
    assert report["feedback_source"] == "Rules"
    assert "Rules were used" in report["recommender_notice"]


@pytest.mark.parametrize("provider", ["ollama", "api"])
def test_provider_http_failure(monkeypatch, provider):
    monkeypatch.setenv("RECOMMENDER", provider)
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    fake_provider(monkeypatch, {}, provider, 500)
    report = asyncio.run(rec.recommend(analyze(*demo_events())))
    assert report["feedback_source"] == "Rules"
    assert report["recommender_notice"]


def test_missing_key_and_rules_with_key(monkeypatch):
    monkeypatch.setenv("RECOMMENDER", "api")
    report = asyncio.run(rec.recommend(analyze(*demo_events())))
    assert "No API key" in report["recommender_notice"]
    monkeypatch.setenv("RECOMMENDER", "rules")
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    monkeypatch.setattr(
        rec.httpx,
        "AsyncClient",
        lambda **kwargs: pytest.fail("Rules must not use the network"),
    )
    assert (
        asyncio.run(rec.recommend(analyze(*demo_events())))["feedback_source"]
        == "Rules"
    )


def test_per_ip_rate_limit(monkeypatch):
    monkeypatch.setenv("API_REQUESTS_PER_MINUTE", "2")
    assert rec.allow_api("first")
    assert rec.allow_api("first")
    assert not rec.allow_api("first")
    assert rec.allow_api("second")
    monkeypatch.setenv("RECOMMENDER", "api")
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    report = asyncio.run(rec.recommend(analyze(*demo_events()), "first"))
    assert "request limit" in report["recommender_notice"]
    assert report["feedback_source"] == "Rules"


def test_polyphonic_report_hides_scores():
    info = dict(assessment_limited=True, warnings=["Overlapping notes detected."])
    report = analyze(*demo_events(), source="audio", audio_info=info)
    assert report["score"] is report["pitch_score"] is report["timing_score"] is None
    report["recommendations"] = rec.rules(report)
    assert all("unreliable" in r["reason"] for r in report["recommendations"])
    assert "single-note" in report["recommendations"][0]["body"]
