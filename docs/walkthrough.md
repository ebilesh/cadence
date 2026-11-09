# Demonstrating Cadence

Start the saved demo with `python demo_server.py`. The initial Piano studio is a
focused editing and practice workspace. Open Try chord example, compare Original
audio with Detected notes, drag a note, then Undo/Redo the correction. Loop a short
range at 50% speed. Try the metronome and count-in, switch to Sheet music, and
explain the explicit 4/4/eighth-note assumption. Save a named session, reload, and
open Saved sessions to demonstrate recovery. Practice reports can be saved there
too. Live following and Practice report are separate navigation entries.

For the existing report walkthrough, first open Practice report. Explain the
task: compare a short piano take with a reference and decide which bars to repeat.

1. Open **Live following**. In **Score follower**, click **Replay study**. The eight-chord reference plays
   in the browser and the current attack moves as its pitch set is matched.
2. Click **Stop** after a few attacks, reload the page, then click **Replay from
   here**. The score and musical position restore; devices never reconnect
   automatically. Replay reaches **Complete** with eight matched attacks.
3. Use **Previous attack** or **Next attack** to reposition. The next notes are
   shown beside those controls. Selecting a starting position resets counts for
   that attempt without marking earlier notes as skipped.
4. Choose **Follow MIDI** to use a keyboard, or **Follow microphone** to follow
   one top note at a time. Microphone following estimates C3–C6 and needs a release
   between repeated notes. This is not polyphonic microphone transcription.
5. Open **Practice report**. In the saved report, play the reference and select a flagged note.
   Explain its pitch and timing separately. Open a flagged bar in the heatmap,
   follow it into the note table, and read its practice exercise.
6. Export the report. The report is saved Python output; reference uploads and
   analysis of new takes require the full Python backend. Replay and live
   following work without an API and do not upload audio.

[Silent replay and recovery recording](score-follower-demo.mp4) ·
[Animated preview](score-follower-demo.gif)

## Refresh the presentation media

From the repository root, with Node, Python, Playwright, Chromium, and FFmpeg
installed:

```sh
npm ci
npm run build
python tools/update_demo.py
python tools/test_public_demo_browser.py --site-dir demo --capture-media
```

The script serves the real static build on an automatically selected local port,
checks that it sends no API requests, then records replay, pause, reload,
recovery and completion. It uses Chromium's screencast protocol and the installed
FFmpeg, so video capture needs no Playwright FFmpeg download. It writes a silent
MP4 and GIF plus 1440px desktop and 390px mobile screenshots in both themes.
Screenshots pause after the third matched attack and use a fresh browser context
for each theme. No mock scores or image overlays are added.

The README preview and submission image show the same current light desktop
view. See [desktop light](laptop-light.png), [desktop dark](laptop-dark.png),
[mobile light](phone-light.png), and [mobile dark](phone-dark.png).

## Technical decisions to explain

The alignment uses one-to-one sequence matches with explicit gaps. A missing note cannot disappear into several matches. Its time and memory cost are O(NM), bounded by a 600-note limit.

Timing removes start delay and fits overall tempo before measuring local errors. A slower but steady take can score well. Repeated phrases and uneven tempo can still confuse the fit.

MIDI provides discrete pitch and onset events. Audio needs onset detection and a single-pitch estimate, so overlapping sounds can invalidate the score. The interface withholds those scores by default.

Practice exercises follow measured errors. Deterministic rules make their reasons inspectable and reproducible.

## Evidence and limits

Run the backend tests and frontend checks before presenting. Synthetic samples exercise known errors. The two original phone recordings are private and their tests skip when absent; they are not a reproducible accuracy benchmark. Avoid claiming general piano transcription accuracy or a validated proficiency score.

For a next experiment, collect consented recordings with labeled note errors and report precision and recall separately for pitch detections and onsets. Compare quiet, sustained, repeated-note, and overlapping passages before changing thresholds.
