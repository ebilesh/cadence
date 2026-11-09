export function validateNotes(notes) {
  if (
    !Array.isArray(notes) ||
    !notes.length ||
    notes.length > 2000 ||
    notes.some(
      (n) =>
        !n ||
        !Number.isInteger(n.pitch) ||
        n.pitch < 21 ||
        n.pitch > 108 ||
        !Number.isFinite(n.start) ||
        n.start < 0 ||
        !Number.isFinite(n.duration) ||
        n.duration < 0.01 ||
        n.start + n.duration > 60.01,
    )
  )
    throw Error(
      "Use 1–2000 piano notes with valid pitches and times within 60 seconds.",
    );
  return notes;
}

// Standard MIDI format 0: 480 ticks/beat at 120 BPM, seconds preserved.
export function encodeTranscriptionMidi(notes) {
  validateNotes(notes);
  const variable = (value) => {
    const bytes = [value & 127];
    while ((value >>>= 7)) bytes.unshift((value & 127) | 128);
    return bytes;
  };
  const events = notes
    .flatMap((n) => {
      const start = Math.round(n.start * 960),
        end = Math.max(start + 1, Math.round((n.start + n.duration) * 960));
      return [
        { tick: start, kind: 1, pitch: n.pitch },
        { tick: end, kind: 0, pitch: n.pitch },
      ];
    })
    .sort((a, b) => a.tick - b.tick || a.kind - b.kind || a.pitch - b.pitch);
  const data = [0, 255, 81, 3, 7, 161, 32, 0, 192, 0];
  let tick = 0;
  for (const event of events) {
    data.push(
      ...variable(event.tick - tick),
      event.kind ? 144 : 128,
      event.pitch,
      event.kind ? 90 : 0,
    );
    tick = event.tick;
  }
  data.push(0, 255, 47, 0);
  const length = data.length;
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    (length >>> 24) & 255,
    (length >>> 16) & 255,
    (length >>> 8) & 255,
    length & 255,
    ...data,
  ]);
}
