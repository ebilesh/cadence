import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeTranscriptionMidi,
  validateNotes,
} from "../src/transcription.js";

function readMidi(bytes) {
  const view = new DataView(bytes.buffer);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "MThd");
  assert.equal(view.getUint16(12), 480);
  assert.equal(view.getUint32(18), bytes.length - 22);
  let offset = 22,
    tick = 0;
  const events = [];
  const variable = () => {
    let n = 0,
      b;
    do {
      b = bytes[offset++];
      n = (n << 7) | (b & 127);
    } while (b & 128);
    return n;
  };
  while (offset < bytes.length) {
    tick += variable();
    const status = bytes[offset++];
    if (status === 255) {
      offset++;
      const size = variable();
      offset += size;
    } else if (status === 192) offset++;
    else {
      const pitch = bytes[offset++],
        velocity = bytes[offset++];
      events.push({ tick, status, pitch, velocity });
    }
  }
  return events;
}
test("MIDI export preserves simultaneous notes, seconds, and note-off before repeated attack", () => {
  const notes = [
    { pitch: 60, start: 0.1, duration: 0.5 },
    { pitch: 64, start: 0.1, duration: 0.5 },
    { pitch: 60, start: 0.6, duration: 0.2 },
  ];
  const events = readMidi(encodeTranscriptionMidi(notes));
  assert.deepEqual(
    events.slice(0, 2).map((e) => [e.tick, e.pitch]),
    [
      [96, 60],
      [96, 64],
    ],
  );
  const atBoundary = events.filter((e) => e.tick === 576);
  assert.deepEqual(
    atBoundary.map((e) => e.status),
    [128, 128, 144],
  );
  assert.equal(events.at(-1).tick, 768);
});
test("bad corrections cannot generate invalid MIDI", () => {
  const valid = { pitch: 60, start: 0, duration: 0.2 };
  for (const notes of [
    [],
    [null],
    [{ ...valid, pitch: 109 }],
    [{ ...valid, pitch: 60.2 }],
    [{ ...valid, start: -1 }],
    [{ ...valid, start: NaN }],
    [{ ...valid, duration: 0 }],
    [{ ...valid, start: 59.9, duration: 1 }],
  ])
    assert.throws(() => encodeTranscriptionMidi(notes));
  assert.equal(validateNotes([valid])[0], valid);
});
