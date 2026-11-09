# Checks and limits

The score-follower revision passed 42 backend tests with two private-recording
skips on Python 3.12, 12 frontend tests, and the production build. The browser
suite exercised synthetic MIDI and microphone streams, cleanup, reference upload,
page reload, and an actual backend process restart. Synthetic inputs do not
establish accuracy on physical hardware.

The public static demo is checked separately: replay completes all eight chords,
pause/reload resumes from its checkpoint, JSON report export works, live browser
input controls remain available, and upload controls are absent. Quick demo and
replay make no API requests. Current screenshots cover light and dark themes at
1440px desktop and 390px mobile widths. The accompanying recording is silent and
shows replay and reload recovery. These are captures of the actual browser build.

Cloudflare configuration and the deployable build are included. Deployment needs
Cloudflare authentication or the repository's connected Cloudflare build service;
a passing local build does not establish that production has been updated.

The quick demo includes saved output from Python analysis. Its snapshot is checked by a test. It needs only Python 3 to run.

I tested two phone recordings of a piano. The clean take improved from 40 detections and 8 extras to 32 detections and no extras. The mistaken take improved from 37 detections and 6 extras to 32 detections and 1 extra. Both now show estimated scores. These recordings stay local; they are not included in the repository.

The overlap and onset filters are heuristics. Fast repetitions can merge, quiet attacks can disappear, and resonance can still confuse pitch tracking. Partial takes can align badly. Scores do not measure musical expression.
