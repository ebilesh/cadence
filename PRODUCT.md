# Cadence

Cadence is a piano transcription and practice studio. A player can turn a short
recording into editable note estimates, compare it with the original, practice a
loop, and save the work for another session. It also offers live score following
and reference-based pitch/timing reports.

The core audience is a pianist practicing at a computer or phone. The interface
must explain AI uncertainty in plain language and keep playback/stop, editing,
and saving easy to find. It is not a validated musical proficiency grader.

The selected visual direction is a green piano studio: focused editor, transport
controls, and a session library. Preserve the green light/dark identity and use
self-hosted Manrope/DM Sans. Separate Piano studio, Live following, Practice
report, and Saved sessions instead of stacking every tool on one long page.

The public static demo offers a real saved AI chord transcription and all local
editing, playback, notation, and storage tools. New transcription and direct
recording-to-transcription require the full app's Python backend. Live microphone
following is monophonic; uploaded Basic Pitch transcription supports overlapping
notes but needs review, especially with noise, pedal, or dense music.

Saved sessions and original recordings remain in this browser's IndexedDB and do
not sync between devices. Saving a named studio session enables autosave for its
edits and practice settings. Reports are saved explicitly. Notation is an eighth-
note quantized 4/4 practice view at the user-selected tempo, not verified engraving.
