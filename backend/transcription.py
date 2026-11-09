"""Local polyphonic audio transcription with Spotify's pretrained Basic Pitch model."""
from functools import lru_cache
import hashlib
from pathlib import Path
import threading
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd
from vendor.basic_pitch.notes import output_to_notes_polyphonic, model_frames_to_time

MODEL = Path(__file__).parent / 'models/basic-pitch-0.4.onnx'
MODEL_SHA256 = "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec"
MAX_SECONDS = 60
MAX_NOTES = 2000
# Avoid concurrent CPU-heavy requests. The API reports busy instead of queuing uploads.
TRANSCRIPTION_LOCK = threading.Lock()


@lru_cache(maxsize=1)
def model_session():
    if hashlib.sha256(MODEL.read_bytes()).hexdigest() != MODEL_SHA256:
        raise RuntimeError("The transcription model checksum does not match. Restore the tracked model file.")
    import onnxruntime as ort
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(str(MODEL), sess_options=options, providers=['CPUExecutionProvider'])


def load_audio(path):
    try:
        with sf.SoundFile(path) as audio:
            if audio.samplerate < 8000 or audio.samplerate > 192000 or audio.channels > 2:
                raise ValueError('Use mono or stereo audio sampled between 8 and 192 kHz.')
            duration = audio.frames / audio.samplerate
            if not .15 <= duration <= MAX_SECONDS:
                raise ValueError('Choose a recording between 0.15 and 60 seconds.')
            data = audio.read(dtype='float32', always_2d=True).mean(axis=1)
            rate = audio.samplerate
    except (sf.LibsndfileError, RuntimeError) as error:
        raise ValueError('This recording could not be decoded. Choose WAV, FLAC, or OGG.') from error
    if not np.isfinite(data).all() or np.max(np.abs(data)) < .0001:
        raise ValueError('No usable sound was found. Choose a louder piano recording.')
    divisor = gcd(rate, 22050)
    return resample_poly(data, 22050 // divisor, rate // divisor).astype(np.float32), duration


def infer(audio):
    # Match Basic Pitch's 30-frame overlap, padding, and output trimming.
    size, overlap, hop = 43844, 30 * 256, 43844 - 30 * 256
    padded = np.pad(audio, (overlap // 2, 0))
    frames, onsets = [], []
    session = model_session()
    for start in range(0, len(padded), hop):
        window = padded[start:start + size]
        window = np.pad(window, (0, size - len(window)))[None, :, None]
        note, onset = session.run(['StatefulPartitionedCall:1', 'StatefulPartitionedCall:2'],
                                  {'serving_default_input_2:0': window})
        frames.append(note[0, 15:-15])
        onsets.append(onset[0, 15:-15])
    count = int(np.floor(len(audio) * (86 / 22050)))
    return np.concatenate(frames)[:count], np.concatenate(onsets)[:count]


def transcribe(path):
    audio, duration = load_audio(path)
    frames, onsets = infer(audio)
    # Disable inferred onsets: the upstream implementation divides by zero on silence.
    # The learned onset network and frame fallback still detect simultaneous notes.
    events = output_to_notes_polyphonic(frames, onsets, onset_thresh=.5, frame_thresh=.3,
        min_note_len=8, infer_onsets=False, min_freq=None, max_freq=None)
    times = model_frames_to_time(len(frames) + 1)
    notes = []
    for start, end, pitch, activation in events:
        a, b = max(0., float(times[start])), min(duration, float(times[end]))
        if b - a >= .08 and 21 <= pitch <= 108:
            notes.append(dict(pitch=int(pitch), start=round(a, 4), duration=round(b-a, 4),
                              activation=round(float(activation), 4)))
    notes.sort(key=lambda n: (n['start'], n['pitch']))
    if not notes:
        raise ValueError('No piano notes were detected. Try a clearer recording with less background noise.')
    if len(notes) > MAX_NOTES:
        raise ValueError('Too many notes were detected. Choose a shorter recording.')
    return dict(model='Spotify Basic Pitch 0.4.0 (ONNX)', duration=round(duration, 3), notes=notes,
        warnings=['AI estimates may miss notes or add harmonics. Check and edit the result before using it.',
                  'Pedal, overlapping instruments, noise, and dense chords can reduce accuracy.'])
