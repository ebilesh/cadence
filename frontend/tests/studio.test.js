import { test } from "node:test";
import assert from "node:assert/strict";
import {
  historyStart,
  historyEdit,
  historyUndo,
  historyRedo,
  moveNote,
  practiceNotes,
  notationBars,
  metronomeNotes,
} from "../src/studio-core.js";
import { validateSession } from "../src/session-store.js";
const note = { pitch: 60, start: 0.5, duration: 1 };
test("edits undo/redo without mutating input; new edits drop redo history", () => {
  const start = historyStart([note]);
  const edited = historyEdit(start, [{ ...note, pitch: 64 }]);
  assert.equal(start.present[0].pitch, 60);
  assert.equal(historyUndo(edited).present[0].pitch, 60);
  assert.equal(historyRedo(historyUndo(edited)).present[0].pitch, 64);
  assert.equal(historyEdit(historyUndo(edited), []).future.length, 0);
  let h = start;
  for (let i = 0; i < 70; i++) h = historyEdit(h, [note]);
  assert.equal(h.past.length, 50);
});
test("drag/nudge bounds respect piano range and 60 second recording", () => {
  assert.deepEqual(moveNote(note, -10, -100), { ...note, start: 0, pitch: 21 });
  assert.deepEqual(moveNote(note, 100, 100), {
    ...note,
    start: 59,
    pitch: 108,
  });
  assert.equal(moveNote(note, 0.1234, 1).start, 0.623);
});
test("loop clipping and slow playback preserve pitches and count-in timing", () => {
  const p = practiceNotes(
    [
      { pitch: 60, start: 0.5, duration: 1 },
      { pitch: 67, start: 1.5, duration: 1 },
    ],
    { start: 1, end: 2, speed: 0.5, bpm: 120, baseBpm: 120, countIn: 4 },
  );
  assert.equal(p.lead, 4);
  assert.equal(p.duration, 6);
  assert.deepEqual(
    p.notes.slice(0, 2).map((n) => [n.pitch, n.start, n.duration]),
    [
      [60, 4, 1],
      [67, 5, 1],
    ],
  );
  assert.equal(p.notes.length, 6);
  assert.throws(() => practiceNotes([note], { start: 2, end: 1 }));
});
test("metronome has a four-beat accent pattern and rejects invalid tempo", () => {
  const clicks = metronomeNotes(120, 1);
  assert.equal(clicks.length, 4);
  assert.deepEqual(
    clicks.map((n) => n.start),
    [0, 0.5, 1, 1.5],
  );
  assert.equal(clicks[0].pitch, 96);
  assert.throws(() => metronomeNotes(0));
});
test("notation fills every 4/4 bar, splits hands, and ties sustained pitches", () => {
  const bars = notationBars(
    [
      { pitch: 60, start: 0, duration: 3 },
      { pitch: 48, start: 0.5, duration: 0.5 },
    ],
    120,
  );
  assert.equal(bars.length, 2);
  for (const bar of bars)
    for (const staff of bar.staves)
      assert.equal(
        staff.segments.reduce((s, n) => s + n.units, 0),
        8,
      );
  assert.ok(bars[0].staves[1].segments.some((n) => n.pitches.includes(48)));
  assert.ok(bars[1].staves[0].segments[0].continuing.includes(60));
});
test("saved session validates notes and audio while allowing a fully deleted take", () => {
  const record = {
    version: 1,
    id: "x",
    name: "Take",
    notes: [],
    originalNotes: [note],
    audio: new Blob(["wav"]),
    updated: Date.now(),
  };
  assert.equal(validateSession(record), record);
  assert.throws(() =>
    validateSession({ ...record, notes: [{ ...note, pitch: 999 }] }),
  );
  assert.throws(() => validateSession({ ...record, audio: "not a recording" }));
});

test("practice reports remain a distinct saved session type", () => {
  const record = {
    version: 1,
    kind: "report",
    id: "report",
    name: "Practice report",
    updated: Date.now(),
    report: { notes: [], reference: [], sections: [], counts: {} },
  };
  assert.equal(validateSession(record), record);
  assert.throws(() => validateSession({ ...record, report: { notes: [] } }));
});

test("a repeated pitch is rearticulated rather than tied to an older overlapping note", () => {
  const staff = notationBars(
    [
      { pitch: 60, start: 0, duration: 2 },
      { pitch: 60, start: 0.5, duration: 0.5 },
    ],
    120,
  )[0].staves[0];
  const repeated = staff.segments.find((segment) => segment.at === 2);
  assert.deepEqual(repeated.pitches, [60]);
  assert.deepEqual(repeated.continuing, []);
});

test("practice BPM scales note onsets, lengths, and loop period together", () => {
  const notes = [{ pitch: 60, start: 0.5, duration: 1 }];
  const normal = practiceNotes(notes, { end: 2, bpm: 100 });
  const slow = practiceNotes(notes, { end: 2, bpm: 50 });
  const fast = practiceNotes(notes, { end: 2, bpm: 200 });
  assert.equal(slow.notes[0].start, normal.notes[0].start * 2);
  assert.equal(slow.notes[0].duration, normal.notes[0].duration * 2);
  assert.equal(fast.duration, normal.duration / 2);
  assert.equal(fast.notes[0].pitch, 60);
  const combined = practiceNotes(notes, { end: 2, bpm: 200, speed: 0.5 });
  assert.equal(combined.duration, normal.duration);
});
test("loop seam has one full beat of spacing and no click at its endpoint", () => {
  for (const bpm of [40, 100, 120, 240]) {
    const p = practiceNotes([note], {
      end: 1.31,
      bpm,
      metronome: true,
      loop: true,
      countIn: 4,
    });
    const clicks = p.notes.filter(
      (n) => n.instrument === "click" && n.start >= p.lead,
    );
    const beat = 60 / bpm;
    assert.ok(Math.abs(p.duration - clicks.at(-1).start - beat) < 1e-9);
    assert.ok(clicks.every((n) => n.start < p.duration));
    assert.equal(
      p.notes.filter((n) => n.instrument === "click" && n.start === p.lead)
        .length,
      1,
    );
    assert.equal(p.notes.filter((n) => n.instrument !== "click").length, 1);
  }
});
