# Basic Pitch model

`basic-pitch-0.4.onnx` is Spotify Basic Pitch 0.4.0's ICASSP 2022 ONNX model,
extracted without modification from the official PyPI wheel.

- Upstream: https://github.com/spotify/basic-pitch
- Package: https://pypi.org/project/basic-pitch/0.4.0/
- Wheel SHA-256: 738adb503aae7fdfc7d1e1511aa0ce35052315f260a19531ef4c356708425db0
- Model SHA-256: 2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec
- License and notice: ../vendor/basic_pitch/LICENSE and NOTICE

The minimal note decoder in ../vendor/basic_pitch/notes.py is adapted from that
same release. Cadence's audio validation, ONNX adapter, and UI are separate code.
This model detects multiple instruments; Cadence focuses the workflow on piano.
It does not establish real-piano transcription accuracy. No runtime model download
or external AI service is required.
