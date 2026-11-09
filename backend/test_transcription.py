"""Real model regressions are synthetic fixtures, not real-piano accuracy claims."""
from pathlib import Path
import io
import json
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from main import app
import transcription as tx

ROOT = Path(__file__).resolve().parents[1]
client = TestClient(app)


def wav(samples, rate=22050):
    out = io.BytesIO()
    sf.write(out, samples, rate, format='WAV')
    return out.getvalue()


def test_real_model_detects_all_simultaneous_chord_notes():
    report = tx.transcribe(ROOT / 'samples/chords.wav')
    assert len(report['notes']) == 12
    for index, onset in enumerate([0, .6, 1.2, 1.8]):
        chord = report['notes'][index*3:index*3+3]
        assert {n['pitch'] for n in chord} == {60, 64, 67}
        assert all(abs(n['start'] - onset) < .06 for n in chord)
        assert all(.3 < n['duration'] < .55 for n in chord)
    saved = json.loads((ROOT / 'frontend/src/transcription-demo.json').read_text())
    assert saved['model'] == report['model']
    assert len(saved['notes']) == len(report['notes'])
    for expected, actual in zip(saved['notes'], report['notes']):
        assert expected['pitch'] == actual['pitch']
        assert expected['start'] == pytest.approx(actual['start'], abs=.02)
        assert expected['duration'] == pytest.approx(actual['duration'], abs=.02)


def test_api_transcribes_without_a_reference_and_removes_upload(monkeypatch):
    original = tx.transcribe
    seen = []
    def checked(path):
        seen.append(path)
        return original(path)
    monkeypatch.setattr(tx, 'transcribe', checked)
    response = client.post('/api/transcribe', files={'audio': ('chords.wav', (ROOT/'samples/chords.wav').read_bytes())})
    assert response.status_code == 200, response.text
    assert len(response.json()['notes']) == 12
    assert seen and not seen[0].exists()
    assert not tx.TRANSCRIPTION_LOCK.locked()


@pytest.mark.parametrize('filename,data',[
    ('wrong.mid', b'not audio'),('broken.wav', b'broken'),
    ('silent.wav', wav(np.zeros(22050))),
    ('long.wav', wav(np.zeros(22050*61))),
    ('short.wav', wav(np.zeros(100))),
])
def test_invalid_audio_rejected_and_lock_released(filename, data):
    response=client.post('/api/transcribe',files={'audio':(filename,data)})
    assert response.status_code == 422, response.text
    assert not tx.TRANSCRIPTION_LOCK.locked()


def test_busy_returns_retry_after():
    with tx.TRANSCRIPTION_LOCK:
        response=client.post('/api/transcribe',files={'audio':('x.wav',b'x')})
    assert response.status_code == 429
    assert response.headers['retry-after'] == '5'


def test_model_failures_are_actionable_and_release_lock(monkeypatch):
    def fail(_path):
        raise RuntimeError('test model failure')
    monkeypatch.setattr(tx,'transcribe',fail)
    response=client.post('/api/transcribe',files={'audio':('x.wav',b'x')})
    assert response.status_code == 503
    assert not tx.TRANSCRIPTION_LOCK.locked()


def test_cancelled_request_keeps_worker_file_and_lock_until_finished(monkeypatch):
    import asyncio
    import threading
    from starlette.datastructures import UploadFile
    from main import transcribe_audio
    started, finish = threading.Event(), threading.Event()
    paths = []
    def worker(path):
        paths.append(path)
        started.set()
        assert finish.wait(timeout=5)
        return {'notes': []}
    monkeypatch.setattr(tx, 'transcribe', worker)
    async def scenario():
        upload=UploadFile(filename='x.wav',file=io.BytesIO(b'audio'))
        task=asyncio.create_task(transcribe_audio(upload))
        try:
            assert await asyncio.to_thread(started.wait, 2)
            task.cancel()
            await asyncio.sleep(.02)
            assert tx.TRANSCRIPTION_LOCK.locked()
            assert paths[0].exists()
            finish.set()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert not tx.TRANSCRIPTION_LOCK.locked()
            assert not paths[0].exists()
        finally:
            finish.set()
    asyncio.run(scenario())
