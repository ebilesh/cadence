# Checks and limits

The score-follower revision passed 52 backend tests with two private-recording
skips on Python 3.12, 23 frontend tests, and the production build. The browser
suite exercised synthetic MIDI and microphone streams, cleanup, reference upload,
page reload, and an actual backend process restart. Synthetic inputs do not
establish accuracy on physical hardware. Additional regressions cover device
disconnection, shared MIDI listeners, seeking without false skipped-note counts,
legacy checkpoints, and guidance after consecutive mismatches.

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


AI transcription checks run the bundled pretrained model rather than replacing
it with fake predictions. The included synthesized recording has 12 expected
notes, all detected at the expected pitches and within 60 ms of their onsets.
API checks cover malformed, silent, short/long audio, competing requests, model
failures, temporary-file cleanup, and worker lifetime after cancellation. Browser
checks upload the real sample, correct a pitch, export MIDI, and parse the file
with an independent MIDI reader. This does not demonstrate general real-piano
accuracy; physical recordings still need broader validation.


Phone playback uses generated PCM WAV with native media playback for all three
sound buttons. Tests verify non-silent samples, synchronous play during the user
gesture, media-session routing when available, blocked-play errors, cleanup,
and switching players. Chromium browser tests exercise all three buttons with
an iPhone viewport/user agent and touch input, checking that decoded audio time
advances. This is browser emulation, not a physical iPhone speaker test.
