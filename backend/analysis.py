"""Compare MIDI notes or estimated audio notes with a reference passage."""

import math
from pathlib import Path
from typing import TypedDict, NotRequired
import numpy as np


class Note(TypedDict):
    pitch: int
    start: float
    duration: float
    confidence: NotRequired[float]


def demo_events() -> tuple[list[Note], list[Note]]:
    pitches = [60, 64, 67, 72, 71, 67, 64, 62, 60, 64, 67, 74, 72, 69, 65, 62] * 2
    reference = [
        dict(pitch=p, start=i * 0.5, duration=0.38) for i, p in enumerate(pitches)
    ]
    performance = [
        dict(
            n,
            start=n["start"] * 1.04
            + 0.2
            + (0.13 if 9 <= i <= 14 else 0.025 * math.sin(i)),
            pitch=n["pitch"] + (1 if i in [12, 24] else 0),
        )
        for i, n in enumerate(reference)
        if i not in [10, 26]
    ]
    return reference, performance


def read_midi(path: Path) -> list[Note]:
    return read_score(path)["notes"]


def read_score(path: Path) -> dict:
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(str(path))
    notes = sorted(
        [
            dict(pitch=n.pitch, start=n.start, duration=n.end - n.start, confidence=1.0)
            for instrument in midi.instruments
            if not instrument.is_drum
            for n in instrument.notes
        ],
        key=lambda n: (n["start"], n["pitch"]),
    )
    end = max((n["start"] + n["duration"] for n in notes), default=0)
    boundaries = [float(t) for t in midi.get_downbeats() if t < end]
    if not boundaries or boundaries[0] > 0:
        boundaries.insert(0, 0.0)
    boundaries.append(end)
    measures = [
        dict(number=i + 1, start=a, end=b)
        for i, (a, b) in enumerate(zip(boundaries, boundaries[1:]))
        if b > a
    ]
    return dict(
        notes=notes,
        measures=measures,
        meter_assumed=not bool(midi.time_signature_changes),
    )


def polyphony_ratio(
    spectrum: np.ndarray, frequencies: np.ndarray, f0: np.ndarray
) -> float:
    # A second strong peak outside the tracked pitch's harmonics suggests a chord.
    flagged = checked = 0
    for frame in range(0, min(spectrum.shape[1], len(f0)), 3):
        column = spectrum[:, frame]
        if np.max(column) < 1e-6:
            continue
        peaks = (
            np.flatnonzero((column[1:-1] > column[:-2]) & (column[1:-1] > column[2:]))
            + 1
        )
        peaks = peaks[
            (frequencies[peaks] > 45) & (column[peaks] > np.max(column) * 0.24)
        ]
        if len(peaks) < 2:
            checked += 1
            continue
        fundamental = (
            f0[frame]
            if np.isfinite(f0[frame])
            else frequencies[peaks[np.argmax(column[peaks])]]
        )
        if fundamental <= 0:
            continue
        ratios = frequencies[peaks] / fundamental
        harmonic = np.abs(ratios - np.maximum(1, np.round(ratios))) < 0.065
        checked += 1
        fundamental_bins = np.abs(frequencies - fundamental) < max(
            8.0, fundamental * 0.04
        )
        fundamental_strength = (
            float(np.max(column[fundamental_bins])) if fundamental_bins.any() else 0.0
        )
        if np.any(~harmonic) or fundamental_strength < np.max(column) * 0.1:
            flagged += 1
    return flagged / max(checked, 1)


def read_audio(path: Path) -> dict:
    import librosa
    import soundfile as sf

    info = sf.info(str(path))
    if info.duration > 120:
        raise ValueError(
            "The recording is longer than two minutes. Upload a shorter passage."
        )
    y, sr = librosa.load(str(path), sr=22050, mono=True)
    if not len(y) or np.max(np.abs(y)) < 1e-5:
        raise ValueError(
            "The recording is silent. Record closer to the piano or choose another file."
        )
    hop = 512
    onsets = librosa.onset.onset_detect(
        y=y, sr=sr, hop_length=hop, backtrack=True, units="time"
    )
    f0, _, prob = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("A0"),
        fmax=librosa.note_to_hz("C8"),
        sr=sr,
        frame_length=4096,
        hop_length=hop,
        resolution=0.2,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop)
    events = []
    for i, start in enumerate(onsets):
        end = float(onsets[i + 1]) if i + 1 < len(onsets) else len(y) / sr
        mask = (
            (times >= start + 0.025) & (times < min(end, start + 0.3)) & np.isfinite(f0)
        )
        if mask.any():
            events.append(
                dict(
                    pitch=int(round(float(librosa.hz_to_midi(np.median(f0[mask]))))),
                    start=float(start),
                    duration=max(0.01, end - start),
                    confidence=round(float(np.median(prob[mask])), 3),
                )
            )
    spectrum = np.abs(librosa.stft(y, n_fft=4096, hop_length=hop))
    ratio = polyphony_ratio(spectrum, librosa.fft_frequencies(sr=sr, n_fft=4096), f0)
    warnings = [
        "Audio results are estimates. Use MIDI for chords or check these notes by ear."
    ]
    limited = ratio >= 0.25
    if limited:
        warnings.append(
            "This recording may contain overlapping notes or strong reverb. Scores are hidden because single-pitch tracking is unreliable here. Try a single-note passage or MIDI."
        )
    if events and np.mean([n["confidence"] for n in events]) < 0.6:
        warnings.append(
            "Pitch tracking confidence is low. Low-confidence notes have less weight in the scores."
        )
    return dict(
        notes=events,
        warnings=warnings,
        assessment_limited=limited,
        polyphony_ratio=round(ratio, 3),
    )


def align(
    r: list[Note], p: list[Note], rt: np.ndarray, pt: np.ndarray
) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    n, m = len(r), len(p)
    cost = np.full((n + 1, m + 1), np.inf)
    cost[:, 0] = np.arange(n + 1) * 1.2
    cost[0, :] = np.arange(m + 1) * 1.2
    step = np.zeros((n + 1, m + 1), dtype=np.uint8)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            # Capping pitch cost keeps an isolated wrong pitch as one error, not two gaps.
            match = min(abs(r[i - 1]["pitch"] - p[j - 1]["pitch"]) * 0.65, 1.5) + min(
                abs(rt[i - 1] - pt[j - 1]) / 0.3, 2
            )
            options = [
                cost[i - 1, j - 1] + match,
                cost[i - 1, j] + 1.2,
                cost[i, j - 1] + 1.2,
            ]
            step[i, j] = np.argmin(options)
            cost[i, j] = min(options)
    pairs = []
    missing = []
    extra = []
    i, j = n, m
    while i or j:
        choice = int(step[i, j]) if i and j else (1 if i else 2)
        if choice == 0:
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif choice == 1:
            missing.append(i - 1)
            i -= 1
        else:
            extra.append(j - 1)
            j -= 1
    return sorted(pairs), sorted(missing), sorted(extra)


def fit_tempo(
    pairs: list[tuple[int, int]], r: list[Note], p: list[Note]
) -> np.ndarray | None:
    good = [
        (p[j]["start"], r[i]["start"])
        for i, j in pairs
        if r[i]["pitch"] == p[j]["pitch"] and p[j].get("confidence", 1) >= 0.4
    ]
    if len(good) < 3:
        return None
    x, y = np.array(good).T
    different = np.abs(x[:, None] - x[None, :]) > 0.25
    slopes = (y[:, None] - y[None, :])[different] / (x[:, None] - x[None, :])[different]
    if not len(slopes):
        return None
    slope = float(np.median(slopes))
    intercept = float(np.median(y - slope * x))
    coefficients = np.array([slope, intercept])
    # Fit gradual acceleration only when enough notes support a smooth trend.
    residual = y - np.polyval(coefficients, x)
    if len(good) >= 12 and np.median(np.abs(residual)) > 0.015:
        keep = np.abs(residual - np.median(residual)) < max(
            0.06, 3 * np.median(np.abs(residual))
        )
        if keep.sum() >= 10:
            quadratic = np.polyfit(x[keep], y[keep], 2)
            derivative = 2 * quadratic[0] * np.array([x.min(), x.max()]) + quadratic[1]
            if (
                np.all(derivative > 0.25)
                and np.all(derivative < 4)
                and np.median(np.abs(y - np.polyval(quadratic, x)))
                < np.median(np.abs(residual)) * 0.65
            ):
                coefficients = quadratic
    return coefficients if 0.25 < slope < 4 else None


def analyze(
    reference: list[Note],
    performance: list[Note],
    source: str = "midi",
    measures: list[dict] | None = None,
    audio_info: dict | None = None,
    meter_assumed: bool = False,
) -> dict:
    if not reference or not performance:
        raise ValueError(
            "No notes were detected. Check the MIDI files or record a louder single-note passage."
        )
    if len(reference) > 600 or len(performance) > 600:
        raise ValueError(
            "The passage has more than 600 notes. Choose a shorter section."
        )
    if any(n["start"] + n["duration"] > 120.05 for n in reference + performance):
        raise ValueError(
            "The passage is longer than two minutes. Choose a shorter section."
        )
    r = sorted(reference, key=lambda n: (n["start"], n["pitch"]))
    p = sorted(performance, key=lambda n: (n["start"], n["pitch"]))
    rt = np.array([n["start"] for n in r])
    raw = np.array([n["start"] for n in p])
    scale = max(rt[-1] - rt[0], 0.1) / max(raw[-1] - raw[0], 0.1)
    coefficients = np.array([scale, rt[0] - scale * raw[0]])
    for _ in range(3):
        pt = np.polyval(coefficients, raw)
        pairs, missing, extra = align(r, p, rt, pt)
        fitted = fit_tempo(pairs, r, p)
        if fitted is None:
            break
        coefficients = fitted
    pt = np.polyval(coefficients, raw)
    pairs, missing, extra = align(r, p, rt, pt)
    if not measures:
        end = max(n["start"] + n["duration"] for n in r)
        measures = [
            dict(number=i + 1, start=float(start), end=min(float(start + 2), end))
            for i, start in enumerate(np.arange(0, end, 2))
        ]
        meter_assumed = source != "demo"

    def measure_at(time: float) -> int:
        return next(
            (
                bar["number"]
                for bar in reversed(measures)
                if time >= bar["start"] - 0.001
            ),
            measures[0]["number"],
        )

    rows = []
    for i, j in pairs:
        error = float((pt[j] - rt[i]) * 1000)
        confidence = float(p[j].get("confidence", 1))
        pitch_status = "correct" if r[i]["pitch"] == p[j]["pitch"] else "wrong"
        timing_status = "late" if error > 80 else "early" if error < -80 else "good"
        status = (
            "uncertain"
            if confidence < 0.5
            else ("wrong" if pitch_status == "wrong" else timing_status)
        )
        rows.append(
            dict(
                index=i,
                time=r[i]["start"],
                duration=r[i]["duration"],
                pitch=r[i]["pitch"],
                played=p[j]["pitch"],
                played_time=round(float(pt[j]), 4),
                played_duration=round(p[j]["duration"] * scale, 4),
                raw_played_time=p[j]["start"],
                confidence=confidence,
                error_ms=round(error),
                status=status,
                pitch_status=pitch_status,
                timing_status=timing_status,
                measure=measure_at(r[i]["start"]),
            )
        )
    for i in missing:
        rows.append(
            dict(
                index=i,
                time=r[i]["start"],
                duration=r[i]["duration"],
                pitch=r[i]["pitch"],
                played=None,
                played_time=None,
                played_duration=None,
                raw_played_time=None,
                confidence=None,
                error_ms=None,
                status="missed",
                pitch_status="missed",
                timing_status="missed",
                measure=measure_at(r[i]["start"]),
            )
        )
    rows.sort(key=lambda n: n["index"])
    extras = [
        dict(
            time=round(float(pt[j]), 4),
            duration=p[j]["duration"] * scale,
            pitch=p[j]["pitch"],
            confidence=p[j].get("confidence", 1),
            measure=measure_at(float(pt[j])),
        )
        for j in extra
    ]
    matched = [n for n in rows if n["played"] is not None]
    weights = sum(n["confidence"] for n in matched)
    extra_weight = sum(n["confidence"] for n in extras)
    pitch = round(
        100
        * sum(n["confidence"] for n in matched if n["pitch_status"] == "correct")
        / max(weights + len(missing) + extra_weight, 0.001)
    )
    timing = round(
        100
        * sum(n["confidence"] * math.exp(-abs(n["error_ms"]) / 150) for n in matched)
        / max(weights + len(missing), 0.001)
    )
    counts = dict(
        missed=len(missing),
        extra=len(extra),
        wrong=sum(n["pitch_status"] == "wrong" for n in matched),
        early=sum(n["timing_status"] == "early" for n in matched),
        late=sum(n["timing_status"] == "late" for n in matched),
        uncertain=sum(n["status"] == "uncertain" for n in matched),
    )
    sections = []
    for bar in measures:
        group = [n for n in rows if n["measure"] == bar["number"]]
        additional = [n for n in extras if n["measure"] == bar["number"]]
        offsets = [n["error_ms"] for n in group if n["error_ms"] is not None]
        sections.append(
            dict(
                **bar,
                label=f"Bar {bar['number']}",
                total=len(group),
                mistakes=sum(n["status"] != "good" for n in group) + len(additional),
                missed=sum(n["played"] is None for n in group),
                wrong=sum(n["pitch_status"] == "wrong" for n in group),
                extra=len(additional),
                early=sum(n["timing_status"] == "early" for n in group),
                late=sum(n["timing_status"] == "late" for n in group),
                mean_error_ms=round(float(np.mean(offsets))) if offsets else 0,
                first_index=group[0]["index"] if group else None,
            )
        )
    info = audio_info or {}
    limited = info.get("assessment_limited", False)
    warnings = list(info.get("warnings", []))
    if meter_assumed:
        warnings.append(
            "The MIDI has no time signature. Bar numbers assume 4/4 from the file start; pickups may be numbered differently."
        )
    local_slope = float(np.polyval(np.polyder(coefficients), np.median(raw)))
    return dict(
        score=None if limited else round(0.55 * pitch + 0.45 * timing),
        pitch_score=None if limited else pitch,
        timing_score=None if limited else timing,
        tempo_ratio=round(1 / local_slope, 3),
        tempo_model="quadratic" if len(coefficients) == 3 else "linear",
        notes=rows,
        reference=r,
        extras=extras,
        sections=sections,
        counts=counts,
        warnings=warnings,
        assessment_limited=limited,
        audio_confidence=(
            round(weights / max(len(matched), 1), 3) if source == "audio" else None
        ),
        polyphony_ratio=info.get("polyphony_ratio"),
        recommendations=[],
        feedback_source="Rules",
        recommender_notice="",
        source=source,
        reference_count=len(r),
        performance_count=len(p),
        meter_assumed=meter_assumed,
    )
