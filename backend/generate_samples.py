from pathlib import Path
import json
import shutil
import pretty_midi
import soundfile as sf
from analysis import demo_events, analyze
from recommendations import rules

folder = Path(__file__).resolve().parents[1] / "samples"
folder.mkdir(exist_ok=True)
for name, events in zip(["reference", "performance"], demo_events()):
    midi = pretty_midi.PrettyMIDI(initial_tempo=120)
    midi.time_signature_changes.append(pretty_midi.TimeSignature(4, 4, 0))
    piano = pretty_midi.Instrument(0)
    piano.notes = [
        pretty_midi.Note(90, n["pitch"], n["start"], n["start"] + n["duration"])
        for n in events
    ]
    midi.instruments.append(piano)
    midi.write(str(folder / f"{name}.mid"))
    if name == "performance":
        sf.write(str(folder / "performance.wav"), midi.synthesize(fs=22050), 22050)
chord = pretty_midi.PrettyMIDI(initial_tempo=120)
instrument = pretty_midi.Instrument(0)
instrument.notes = [
    pretty_midi.Note(90, p, start, start + 0.45)
    for start in [0.0, 0.6, 1.2, 1.8]
    for p in [60, 64, 67]
]
chord.instruments.append(instrument)
sf.write(str(folder / "chords.wav"), chord.synthesize(fs=22050), 22050)
report = analyze(*demo_events(), source="demo")
report["recommendations"] = rules(report)
(folder.parent / "frontend" / "src" / "demo.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
public = folder.parent / "frontend" / "public" / "samples"
public.mkdir(parents=True, exist_ok=True)
for sample in folder.iterdir():
    shutil.copy2(sample, public / sample.name)
print("Generated MIDI files, audio samples, and the Python demo report.")
