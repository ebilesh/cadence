import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodePianoWav,
  loadPianoSamples,
  pianoSample,
} from "../src/piano-samples.js";
import { renderNotesWav } from "../src/audio-playback.js";

test("bundled grand piano samples decode, transpose, and differ from synth fallback", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => ({
    ok: true,
    arrayBuffer: async () => {
      const file = await readFile(new URL("../public" + url, import.meta.url));
      return file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
      );
    },
  }));
  await loadPianoSamples();
  for (const pitch of [21, 36, 60, 69, 108]) {
    const sample = pianoSample(pitch);
    assert.ok(sample.samples.length > 10000);
    assert.equal(sample.rate, 22050);
  }
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const grand = renderNotesWav(notes),
    synth = renderNotesWav(notes, 22050, 0, "synth");
  assert.notDeepEqual(new Uint8Array(grand), new Uint8Array(synth));
  const click = [{ ...notes[0], instrument: "click", duration: 0.025 }];
  assert.deepEqual(
    renderNotesWav(click),
    renderNotesWav(click, 22050, 0, "synth"),
  );
  assert.throws(() => decodePianoWav(new ArrayBuffer(44)));
});
