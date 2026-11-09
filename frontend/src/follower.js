// The streaming follower is independent of audio devices and wall-clock time.
// A checkpoint contains musical position, never a live transport or permission.
export const CHECKPOINT_KEY = "cadence-follower-v1";
export const DEMO_NOTES = [
  [60, 64, 67],
  [62, 65, 69],
  [59, 62, 67],
  [60, 64, 72],
  [65, 69, 72],
  [64, 67, 71],
  [62, 67, 71],
  [60, 64, 72],
].flatMap((pitches, i) =>
  pitches.map((pitch) => ({ pitch, start: i * 0.8, duration: 0.6 })),
);

export function groupScore(notes) {
  if (
    !Array.isArray(notes) ||
    !notes.length ||
    notes.length > 600 ||
    notes.some(
      (n) =>
        !Number.isInteger(n.pitch) ||
        n.pitch < 0 ||
        n.pitch > 127 ||
        !Number.isFinite(n.start) ||
        n.start < 0 ||
        n.start > 120 ||
        !Number.isFinite(n.duration) ||
        n.duration <= 0 ||
        n.start + n.duration > 120.05,
    )
  )
    throw Error("Use a MIDI score with 1–600 notes under two minutes.");
  const groups = [];
  for (const note of [...notes].sort(
    (a, b) => a.start - b.start || a.pitch - b.pitch,
  )) {
    if (!groups.length || note.start - groups.at(-1).start > 0.065)
      groups.push({ start: note.start, pitches: [] });
    const pitches = groups.at(-1).pitches;
    if (!pitches.includes(note.pitch)) pitches.push(note.pitch);
  }
  return groups.map((g) => ({
    ...g,
    pitches: g.pitches.sort((a, b) => a - b),
  }));
}

export class ScoreFollower {
  constructor(notes, checkpoint = null) {
    this.groups = groupScore(notes);
    this.signature = JSON.stringify(this.groups);
    this.position = -1;
    this.matched = 0;
    this.skipped = 0;
    this.rejected = 0;
    if (
      checkpoint?.version === 1 &&
      checkpoint.signature === this.signature &&
      Number.isInteger(checkpoint.position) &&
      checkpoint.position >= -1 &&
      checkpoint.position < this.groups.length &&
      ["matched", "skipped", "rejected"].every(
        (k) => Number.isSafeInteger(checkpoint[k]) && checkpoint[k] >= 0,
      ) &&
      checkpoint.matched + checkpoint.skipped === checkpoint.position + 1
    ) {
      Object.assign(
        this,
        Object.fromEntries(
          ["position", "matched", "skipped", "rejected"].map((k) => [
            k,
            checkpoint[k],
          ]),
        ),
      );
    }
  }
  observe(pitches, mode = "midi") {
    const played = new Set(
      pitches.filter((p) => Number.isInteger(p) && p >= 0 && p <= 127),
    );
    if (!played.size || this.position === this.groups.length - 1)
      return this.snapshot();
    // A bounded search permits recovery after a few missed attacks without
    // jumping to a distant repetition of the same chord.
    let best = null;
    for (
      let i = this.position + 1;
      i < Math.min(this.groups.length, this.position + 5);
      i++
    ) {
      const target =
        mode === "microphone"
          ? [Math.max(...this.groups[i].pitches)]
          : this.groups[i].pitches;
      const overlap = target.filter((p) => played.has(p)).length;
      const similarity = overlap / new Set([...target, ...played]).size;
      const quality = similarity - (i - this.position - 1) * 0.08;
      if (similarity >= 0.6 && (!best || quality > best.quality))
        best = { i, quality };
    }
    if (best) {
      this.skipped += best.i - this.position - 1;
      this.position = best.i;
      this.matched++;
    } else this.rejected++;
    return this.snapshot();
  }
  snapshot() {
    return {
      version: 1,
      signature: this.signature,
      position: this.position,
      matched: this.matched,
      skipped: this.skipped,
      rejected: this.rejected,
    };
  }
}

export function saveSession(storage, notes, name, follower) {
  storage.setItem(
    CHECKPOINT_KEY,
    JSON.stringify({ notes, name, checkpoint: follower.snapshot() }),
  );
}
export function restoreSession(storage) {
  try {
    const raw = storage.getItem(CHECKPOINT_KEY);
    if (!raw || raw.length > 200000) return null;
    const data = JSON.parse(raw);
    if (typeof data.name !== "string" || data.name.length > 200) return null;
    const follower = new ScoreFollower(data.notes, data.checkpoint);
    return { notes: data.notes, name: data.name, follower };
  } catch {
    return null;
  }
}

// YIN-style normalized difference; suppress silence and unpitched noise.
// This estimates one fundamental (C3–C6), not polyphonic microphone input.
export function detectPitch(samples, sampleRate) {
  const rms = Math.sqrt(
    samples.reduce((sum, x) => sum + x * x, 0) / samples.length,
  );
  if (rms < 0.012) return null;
  const min = Math.floor(sampleRate / 1100),
    max = Math.min(
      Math.floor(sampleRate / 125),
      Math.floor(samples.length / 2),
    );
  const diffs = new Float64Array(max + 1);
  let sum = 0;
  for (let lag = 1; lag <= max; lag++) {
    let d = 0;
    for (let i = 0; i < samples.length - max; i++)
      d += (samples[i] - samples[i + lag]) ** 2;
    sum += d;
    diffs[lag] = sum ? (d * lag) / sum : 1;
  }
  for (let lag = min; lag < max - 1; lag++) {
    if (diffs[lag] < 0.12) {
      while (lag + 1 < max && diffs[lag + 1] < diffs[lag]) lag++;
      const left = diffs[lag - 1],
        center = diffs[lag],
        right = diffs[lag + 1];
      const denom = 2 * (2 * center - right - left);
      const refined = lag + (denom ? (right - left) / denom : 0);
      const midi = 69 + 12 * Math.log2(sampleRate / refined / 440);
      const pitch = Math.round(midi);
      if (pitch < 48 || pitch > 84 || Math.abs(midi - pitch) > 0.35)
        return null;
      return { pitch, confidence: 1 - diffs[lag] };
    }
  }
  return null;
}

export function noteName(pitch) {
  return (
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][
      pitch % 12
    ] +
    (Math.floor(pitch / 12) - 1)
  );
}
