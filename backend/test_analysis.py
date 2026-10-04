import json
from pathlib import Path
import pytest
from analysis import analyze, demo_events, read_score, read_audio
from recommendations import rules


@pytest.fixture
def reference():
    return demo_events()[0]


def test_clean_take(reference):
    report = analyze(reference, reference)
    assert report["score"] == 100
    assert report["counts"] == dict(
        missed=0, extra=0, wrong=0, early=0, late=0, uncertain=0
    )


def test_start_offset_and_tempo_drift(reference):
    performed = [dict(n, start=n["start"] * 1.3 + 2) for n in reference]
    assert analyze(reference, performed)["score"] == 100


def test_gradual_tempo_drift(reference):
    performed = [
        dict(n, start=2 + n["start"] * 1.05 + 0.003 * n["start"] ** 2)
        for n in reference
    ]
    report = analyze(reference, performed)
    assert report["timing_score"] >= 98
    assert report["tempo_model"] == "quadratic"


def test_local_late_notes(reference):
    performed = [
        dict(n, start=n["start"] + (0.15 if 9 <= i <= 12 else 0))
        for i, n in enumerate(reference)
    ]
    report = analyze(reference, performed)
    assert report["counts"]["late"] == 4
    assert report["pitch_score"] == 100
    assert report["timing_score"] < 100


def test_wrong_notes(reference):
    performed = [dict(n) for n in reference]
    performed[12]["pitch"] += 12
    report = analyze(reference, performed)
    assert report["counts"]["wrong"] == 1
    assert report["counts"]["missed"] == report["counts"]["extra"] == 0


def test_missed_notes(reference):
    performed = [dict(n) for i, n in enumerate(reference) if i not in [8, 20]]
    report = analyze(reference, performed)
    assert report["counts"]["missed"] == 2
    assert report["counts"]["wrong"] == report["counts"]["extra"] == 0


def test_extra_notes(reference):
    performed = reference + [dict(pitch=91, start=9.8, duration=0.1)]
    report = analyze(reference, performed)
    assert report["counts"]["extra"] == 1
    assert report["counts"]["wrong"] == report["counts"]["missed"] == 0


def test_endpoint_omissions():
    reference = [dict(pitch=60 + i, start=i * 0.5, duration=0.3) for i in range(12)]
    report = analyze(
        reference, [dict(n, start=n["start"] * 1.2 + 3) for n in reference[1:-1]]
    )
    assert report["counts"]["missed"] == 2
    assert report["counts"]["wrong"] == 0
    assert all(
        abs(n["error_ms"]) < 5 for n in report["notes"] if n["played"] is not None
    )


def test_chords():
    notes = [
        dict(pitch=p, start=t, duration=0.4)
        for t in [0.0, 1.0, 2.0]
        for p in [60, 64, 67]
    ]
    assert analyze(notes, list(reversed(notes)))["score"] == 100


def test_confidence_downweights_wrong_pitch(reference):
    performed = [dict(n) for n in reference]
    performed[12]["pitch"] += 1
    high = analyze(reference, performed, "audio")
    performed[12]["confidence"] = 0.1
    low = analyze(reference, performed, "audio")
    assert low["pitch_score"] > high["pitch_score"]
    assert low["notes"][12]["status"] == "uncertain"
    assert low["counts"]["wrong"] == 1


def test_empty_and_long():
    with pytest.raises(ValueError):
        analyze([], [])
    notes = [dict(pitch=60, start=121, duration=0.5)]
    with pytest.raises(ValueError):
        analyze(notes, notes)


def test_measures_read_time_signature(tmp_path):
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(initial_tempo=120)
    midi.time_signature_changes.append(pretty_midi.TimeSignature(3, 4, 0))
    instrument = pretty_midi.Instrument(0)
    instrument.notes = [
        pretty_midi.Note(90, 60, t, t + 0.3) for t in [0.0, 1.0, 2.0, 3.0]
    ]
    midi.instruments.append(instrument)
    path = tmp_path / "reference.mid"
    midi.write(str(path))
    score = read_score(path)
    assert score["measures"][1]["start"] == pytest.approx(1.5)
    assert not score["meter_assumed"]


def test_demo_matches_python():
    snapshot = json.loads(
        (
            Path(__file__).resolve().parents[1] / "frontend" / "src" / "demo.json"
        ).read_text()
    )
    current = analyze(*demo_events(), source="demo")
    current["recommendations"] = rules(current)
    assert snapshot == current


def test_polyphonic_audio_warning():
    info = read_audio(Path(__file__).resolve().parents[1] / "samples" / "chords.wav")
    assert info["assessment_limited"]
    assert info["polyphony_ratio"] >= 0.25
    assert any("Scores are hidden" in warning for warning in info["warnings"])
