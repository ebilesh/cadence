"""Build practice exercises from measured note errors. No network access."""

def count_phrase(count: int, singular: str, plural: str | None = None) -> str:
    return f"{count} {singular if count == 1 else plural or singular + 's'}"


def rules(report: dict) -> list[dict]:
    bars = sorted((b for b in report["sections"] if b["total"] or b["extra"]),
                  key=lambda b: (-b["mistakes"], b["number"]))
    drills = {
        "wrong": [
            ("Check each pitch", "Slow down. Check each pitch against the score before playing it again."),
            ("Read before playing", "At a slow tempo, name each written pitch before pressing its key. Check the score before repeating."),
            ("Check two-note pairs", "Play two-note pairs slowly. Check both pitches against the score before joining the pairs."),
            ("Read the accidentals", "Read the key signature and accidentals slowly. Check each pitch against the score before another take."),
            ("Rebuild the phrase", "Pause before each note in the phrase, check its written pitch, and then play it slowly."),
        ],
        "missed": [
            ("Find the skipped note", "Find the skipped note in the table. Practice only the transition into it before repeating the bar."),
            ("Connect the missing entrance", "Locate the missed note. Loop the previous note and the missing entrance alone."),
            ("Restore the gap", "Find the skipped note. Practice it with its two neighbors as a separate short loop."),
            ("Isolate the skipped key", "Mark the omitted note. Practice moving from the previous key to that key without playing the whole bar."),
            ("Join around the omission", "Locate the skipped note. Practice the move into it and the move out of it separately, then join them."),
        ],
        "timing": [
            ("Match the metronome", "Start at 70% tempo with a metronome. Count the beats aloud and place each entrance on its beat."),
            ("Tap the rhythm first", "Set a metronome below tempo. Tap this bar's rhythm before playing the notes with the same clicks."),
            ("Loop the uneven entrance", "Start below tempo with a metronome. Loop the early or late entrance with the beat before it."),
            ("Count subdivisions", "Use a metronome below tempo and count the smallest note values aloud while playing this bar."),
            ("Build tempo gradually", "Begin below tempo with a metronome. After two evenly timed repeats, raise the speed a little and check again."),
        ],
        "extra": [
            ("Remove extra attacks", "Find the extra notes in the table. Play slowly, pressing only the keys written in the score."),
            ("Check repeated presses", "Compare extra attacks with the score. Isolate the repeated key presses before replaying."),
            ("Keep intended keys", "Loop the phrase around the extra note slowly. Keep unused fingers clear of neighboring keys."),
            ("Count written attacks", "Count the written notes, then check that each slow key press belongs to the score."),
            ("Check the extra entrance", "Record the passage containing the extra entrance alone and compare its attacks with the score."),
        ],
        "clean": [
            ("Connect the next bar", "Play this bar and the following bar together at a comfortable tempo."),
            ("Check a second take", "Record this bar again and compare its timings with the first take."),
            ("Start here", "Begin a take at this bar instead of always starting the whole piece."),
            ("Try a tempo increase", "Raise the tempo slightly, then check whether this bar's timing stays even."),
            ("Play without clicks", "Play this bar once with a metronome and once without it. Compare the timing."),
        ],
        "limited": [
            ("Record one line", "Record this bar as a single-note line before checking pitches."),
            ("Use MIDI for overlap", "Try a MIDI take for this bar to check overlapping notes separately."),
            ("Reduce ringing", "Try this bar without pedal in a quiet room, then inspect the detected notes."),
            ("Listen and compare", "Listen to this bar while reading the detected notes. Treat the pitches as estimates."),
            ("Separate the hands", "Record one hand for this bar before comparing its sequence with the reference."),
        ],
    }
    used = {kind: 0 for kind in drills}
    suggestions = []
    for bar in bars[:5]:
        if len(suggestions) >= 3 and bar["mistakes"] == 0:
            break
        counts = {"wrong": bar["wrong"], "missed": bar["missed"],
                  "timing": bar["early"] + bar["late"], "extra": bar["extra"]}
        # Ties favor pitches, then omissions, timing, and extra attacks.
        kind = max(counts, key=counts.get) if any(counts.values()) else "clean"
        if report["assessment_limited"]:
            kind = "limited"
        title, body = drills[kind][used[kind]]
        used[kind] += 1
        reason = ", ".join([
            count_phrase(bar["wrong"], "wrong pitch", "wrong pitches"),
            count_phrase(bar["missed"], "missed note"),
            count_phrase(bar["extra"], "extra note"),
            count_phrase(bar["early"], "early note"),
            count_phrase(bar["late"], "late note"),
        ]) + "."
        if kind == "limited":
            reason = "Overlapping sounds make this audio estimate unreliable."
        suggestions.append(dict(title=f"Bar {bar['number']}: {title.lower()}",
                                body=body, reason=reason, measures=[bar["number"]]))
    # Short passages still get three different steps for the same focus bar.
    for title, body in [
        ("Mark the score", "Mark the flagged events in this bar before another take."),
        ("Compare another take", "Record this bar again and check whether its flagged events changed."),
    ]:
        if len(suggestions) >= 3:
            break
        focus = bars[0]
        suggestions.append(dict(title=f"Bar {focus['number']}: {title.lower()}", body=body,
                                reason=f"This bar has {count_phrase(focus['mistakes'], 'flagged event')}.",
                                measures=[focus["number"]]))
    return suggestions



async def recommend(report: dict) -> dict:
    report["recommendations"] = rules(report)
    report["feedback_source"] = "Rules"
    return report
