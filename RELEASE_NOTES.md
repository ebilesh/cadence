# Cadence v1.2.0

Piano practice studio with local Python analysis and a browser sample demo.

## Included

- Piano audio transcription using a bundled Basic Pitch ONNX model, editable notes, MIDI export, and synthesized playback.
- MIDI/reference comparison with dynamic-programming alignment, tempo fitting, pitch/timing feedback, and bar-specific practice suggestions.
- Practice loops, tempo/speed controls, metronome and count-in, grand-staff notation, undo/redo, and device-local saved sessions.
- Browser MIDI and microphone score following with replay and recovery checkpoints.
- A public static sample demo, architecture notes, walkthrough, and regression/browser checks.

## Run

For the bundled sample demo, Python 3 is sufficient:

```sh
git clone --branch v1.2.0 https://github.com/ebilesh/cadence.git
cd cadence
python demo_server.py
```

Open http://127.0.0.1:5173.

For new recordings, install the local backend and frontend as described in [README.md](https://github.com/ebilesh/cadence/blob/v1.2.0/README.md). The public static demo does not run new uploads through the Python model.

## Checks and limits

Publication requires backend tests, frontend tests, production and demo builds, score-follower browser checks, and public-demo browser checks to pass in GitHub Actions.

Synthetic audio and browser-emulated devices do not establish accuracy on arbitrary real piano recordings or physical phones. Private-recording tests skip when their files are absent. Scores estimate pitch and timing, not musical expression. Saved sessions stay in the browser and do not sync. See [checks and limits](https://github.com/ebilesh/cadence/blob/v1.2.0/docs/review.md).
