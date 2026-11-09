import { validateNotes } from "./transcription.js";
const copy = (notes) => notes.map((n) => ({ ...n }));
export function historyStart(notes) {
  if (notes.length) validateNotes(notes);
  return { past: [], present: copy(notes), future: [] };
}
export function historyEdit(history, notes) {
  if (notes.length) validateNotes(notes);
  return {
    past: [...history.past, history.present].slice(-50),
    present: copy(notes),
    future: [],
  };
}
export function historyUndo(h) {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1),
        future: [h.present, ...h.future],
      }
    : h;
}
export function historyRedo(h) {
  return h.future.length
    ? {
        past: [...h.past, h.present].slice(-50),
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}
export function moveNote(note, seconds, semitones) {
  const duration = note.duration;
  return {
    ...note,
    pitch: Math.max(21, Math.min(108, note.pitch + Math.round(semitones))),
    start:
      Math.round(
        Math.max(0, Math.min(60 - duration, note.start + seconds)) * 1000,
      ) / 1000,
  };
}
export function practiceNotes(
  notes,
  {
    start = 0,
    end = 60,
    speed = 1,
    bpm = 100,
    baseBpm = 100,
    countIn = 0,
    metronome = false,
    loop = false,
  } = {},
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > 60.01 ||
    !Number.isFinite(speed) ||
    speed < 0.25 ||
    speed > 2 ||
    !Number.isInteger(bpm) ||
    bpm < 40 ||
    bpm > 240 ||
    !Number.isInteger(baseBpm) ||
    baseBpm < 40 ||
    baseBpm > 240 ||
    ![0, 4].includes(countIn)
  )
    throw Error(
      "Choose a valid loop, 25–200% speed, and tempo between 40 and 240 BPM.",
    );
  const playbackSpeed = (speed * bpm) / baseBpm;
  const beat = 60 / bpm / speed,
    lead = countIn * beat;
  const selectedDuration = (end - start) / playbackSpeed;
  const beatCount = Math.max(1, Math.ceil(selectedDuration / beat - 1e-9));
  const musicalDuration =
    loop && metronome ? beatCount * beat : selectedDuration;
  const clipped = notes
    .filter((n) => n.start < end && n.start + n.duration > start)
    .map((n) => ({
      ...n,
      start: lead + (Math.max(n.start, start) - start) / playbackSpeed,
      duration:
        (Math.min(n.start + n.duration, end) - Math.max(n.start, start)) /
        playbackSpeed,
    }));
  const clicks = [];
  for (let i = 0; i < countIn; i++)
    clicks.push({
      pitch: i === 0 ? 96 : 84,
      start: i * beat,
      duration: 0.025,
      instrument: "click",
    });
  if (metronome)
    for (let i = 0; i < beatCount; i++)
      clicks.push({
        pitch: i % 4 === 0 ? 96 : 84,
        start: lead + i * beat,
        duration: 0.025,
        instrument: "click",
      });
  return {
    notes: [...clipped, ...clicks],
    lead,
    duration: lead + musicalDuration,
    selectedDuration,
    playbackSpeed,
    padded: musicalDuration - selectedDuration > 1e-6,
  };
}
export function metronomeNotes(bpm, bars = 4) {
  if (
    !Number.isInteger(bpm) ||
    bpm < 40 ||
    bpm > 240 ||
    !Number.isInteger(bars) ||
    bars < 1 ||
    bars > 16
  )
    throw Error("Choose a tempo between 40 and 240 BPM.");
  return Array.from({ length: bars * 4 }, (_, i) => ({
    pitch: i % 4 === 0 ? 96 : 84,
    start: (i * 60) / bpm,
    duration: 0.025,
    instrument: "click",
  }));
}

// A readable quantized 4/4 view: eighth-note grid, explicit rests and ties.
export function notationBars(notes, bpm = 100) {
  if (!Number.isInteger(bpm) || bpm < 40 || bpm > 240)
    throw Error("Choose 40–240 BPM for notation.");
  const unitsPerSecond = bpm / 30;
  const events = notes.map((n, id) => ({
    ...n,
    id,
    a: Math.round(n.start * unitsPerSecond),
    b: Math.max(
      Math.round(n.start * unitsPerSecond) + 1,
      Math.round((n.start + n.duration) * unitsPerSecond),
    ),
  }));
  const count = Math.max(
    1,
    Math.ceil(Math.max(0, ...events.map((e) => e.b)) / 8),
  );
  return Array.from({ length: count }, (_, bar) => ({
    number: bar + 1,
    staves: ["treble", "bass"].map((clef) => {
      const filtered = events.filter(
        (n) => n.pitch >= 60 === (clef === "treble"),
      );
      const boundaries = new Set([0, 8]);
      for (const n of filtered) {
        if (n.a > bar * 8 && n.a < (bar + 1) * 8) boundaries.add(n.a - bar * 8);
        if (n.b > bar * 8 && n.b < (bar + 1) * 8) boundaries.add(n.b - bar * 8);
      }
      const times = [...boundaries].sort((a, b) => a - b),
        segments = [];
      for (let i = 0; i < times.length - 1; i++) {
        let cursor = times[i],
          remaining = times[i + 1] - cursor;
        const active = filtered.filter(
          (n) => n.a <= bar * 8 + cursor && n.b > bar * 8 + cursor,
        );
        const pitches = [...new Set(active.map((n) => n.pitch))].sort(
          (a, b) => a - b,
        );
        while (remaining) {
          const units = [8, 4, 2, 1].find((n) => n <= remaining);
          segments.push({
            units,
            at: bar * 8 + cursor,
            pitches,
            continuing: pitches.filter(
              (p) =>
                active.some((n) => n.pitch === p && n.a < bar * 8 + cursor) &&
                !active.some((n) => n.pitch === p && n.a === bar * 8 + cursor),
            ),
          });
          cursor += units;
          remaining -= units;
        }
      }
      return { clef, segments };
    }),
  }));
}
