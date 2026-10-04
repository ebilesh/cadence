from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from analysis import analyze, demo_events, read_audio, read_score, filter_audio_events


@pytest.mark.parametrize("shift", [-12, 12, -24])
def test_octave_shift(shift):
    reference = demo_events()[0]
    performed = [dict(n, pitch=n["pitch"] + shift, start=n["start"] * 1.1 + 0.7) for n in reference]
    report = analyze(reference, performed)
    assert report["octave_shift"] == shift
    assert report["score"] == 100
    assert report["counts"]["wrong"] == 0
    assert report["notes"][0]["raw_played_pitch"] == reference[0]["pitch"] + shift
    assert any("octave" in warning for warning in report["warnings"])


def test_unshifted_not_flagged():
    reference = demo_events()[0]
    report = analyze(reference, reference)
    assert report["octave_shift"] == 0
    assert not any("octave" in warning for warning in report["warnings"])


@pytest.mark.parametrize("frequency,volume", [(220, 0.2), (440, 0.8)])
def test_decay_and_weak_retrigger_are_one_note(tmp_path, frequency, volume):
    sr = 22050
    t = np.arange(int(sr * 1.4)) / sr
    def tone(start, strength):
        age = np.maximum(0, t - start)
        envelope = (t >= start) * np.minimum(age / 0.008, 1) * np.exp(-age * 3)
        return strength * envelope * (np.sin(2*np.pi*frequency*age) + 0.2*np.sin(4*np.pi*frequency*age))
    y = volume * (tone(0.25, 1) + tone(0.37, 0.08))
    path = tmp_path / "decay.wav"
    sf.write(path, y, sr)
    audio = read_audio(path)
    assert len(audio["notes"]) == 1
    assert not audio["assessment_limited"]


def test_merge_preserves_separate_attacks_and_drops_short_notes():
    sr = 22050
    y = np.zeros(sr)
    for start in [0.1, 0.5]:
        y[int(start*sr):int((start+0.07)*sr)] = 0.5
    notes = [dict(pitch=60, start=0.1, duration=0.12),
             dict(pitch=60, start=0.22, duration=0.15),
             dict(pitch=60, start=0.5, duration=0.2),
             dict(pitch=65, start=0.8, duration=0.02)]
    filtered = filter_audio_events(notes, y, sr)
    assert [n["start"] for n in filtered] == [0.1, 0.5]


def test_extra_uses_nearest_reference_bar():
    reference = [dict(pitch=60+i%5, start=i*0.5, duration=0.38) for i in range(16)]
    reference += [dict(pitch=64+i%4, start=9+i*0.5, duration=0.38) for i in range(8)]
    measures = [dict(number=i+1, start=i*2, end=(i+1)*2) for i in range(7)]
    report = analyze(reference, reference + [dict(pitch=90, start=8.05, duration=0.1)], measures=measures)
    assert len(report["extras"]) == 1
    assert report["extras"][0]["measure"] == 4
    assert report["sections"][3]["extra"] == 1


def test_withheld_scores_keep_explicit_estimates():
    report = analyze(*demo_events(), source="audio", audio_info=dict(assessment_limited=True))
    assert report["score"] is None
    assert 0 <= report["score_estimates"]["score"] <= 100
    assert report["assessment_limited"]


@pytest.mark.parametrize("filename,before_count,before_extra", [("good.wav",40,8),("messed-up.wav",37,6)])
def test_real_recordings_improve(filename, before_count, before_extra):
    samples = Path(__file__).resolve().parents[1] / "samples"
    path = samples/"real"/filename
    if not path.exists():
        pytest.skip("The phone recording is local and is not included in the repository.")
    audio = read_audio(path)
    score = read_score(samples/"reference.mid")
    report = analyze(score["notes"], audio["notes"], "audio", score["measures"], audio)
    assert report["performance_count"] < before_count
    assert report["counts"]["extra"] < before_extra
    assert report["counts"]["wrong"] == 0
    assert report["score"] is not None
    if filename == "good.wav":
        assert report["performance_count"] == 32
        assert report["counts"]["missed"] == report["counts"]["extra"] == 0
    else:
        assert report["counts"]["missed"] == 1


def test_piano_sustain_and_harmonics(tmp_path):
    sr = 22050
    t = np.arange(int(sr * 2.5)) / sr
    y = np.zeros_like(t)
    for start, frequency in [(0.25, 220), (0.85, 277.18), (1.45, 329.63)]:
        age = np.maximum(0, t-start)
        envelope = (t >= start) * np.minimum(age/0.008, 1) * np.exp(-age*3)
        for harmonic, amplitude in [(1,0.4),(2,0.15),(3,0.08)]:
            y += amplitude * envelope * np.sin(2*np.pi*frequency*harmonic*age)
    path = tmp_path / "sustain.wav"
    sf.write(path, y, sr)
    audio = read_audio(path)
    assert len(audio["notes"]) == 3
    assert not audio["assessment_limited"]


def test_weak_long_detection_is_dropped():
    sr = 22050
    y = np.zeros(sr)
    y[int(0.1*sr):int(0.2*sr)] = 0.5
    y[int(0.6*sr):int(0.7*sr)] = 0.005
    notes = [dict(pitch=60, start=0.1, duration=0.4),
             dict(pitch=65, start=0.6, duration=0.3)]
    assert len(filter_audio_events(notes, y, sr)) == 1


def test_extra_does_not_follow_sustain_into_the_previous_bar():
    reference = demo_events()[0]
    reference[15] = dict(reference[15], duration=3)
    measures = [dict(number=i+1, start=i*2, end=(i+1)*2) for i in range(8)]
    report = analyze(reference, reference + [dict(pitch=90, start=8.3, duration=0.1)], measures=measures)
    assert report["extras"][0]["measure"] == 5
