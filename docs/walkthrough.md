# Demonstrating Cadence

Start the saved demo with `python demo_server.py`. Explain the task: compare a short piano take with a reference and decide which bars to repeat.

1. Play the reference, then select a flagged note. Explain its pitch and timing separately.
2. Open a flagged bar in the heatmap. Follow it into the note table.
3. Read its practice exercise and the counts that selected it.
4. Export the report. Explain that this is saved analysis output; uploads require the full Python backend.

## Technical decisions to explain

The alignment uses one-to-one sequence matches with explicit gaps. A missing note cannot disappear into several matches. Its time and memory cost are O(NM), bounded by a 600-note limit.

Timing removes start delay and fits overall tempo before measuring local errors. A slower but steady take can score well. Repeated phrases and uneven tempo can still confuse the fit.

MIDI provides discrete pitch and onset events. Audio needs onset detection and a single-pitch estimate, so overlapping sounds can invalidate the score. The interface withholds those scores by default.

Practice exercises follow measured errors. Deterministic rules make their reasons inspectable and reproducible.

## Evidence and limits

Run the backend tests and frontend checks before presenting. Synthetic samples exercise known errors. The two original phone recordings are private and their tests skip when absent; they are not a reproducible accuracy benchmark. Avoid claiming general piano transcription accuracy or a validated proficiency score.

For a next experiment, collect consented recordings with labeled note errors and report precision and recall separately for pitch detections and onsets. Compare quiet, sustained, repeated-note, and overlapping passages before changing thresholds.
