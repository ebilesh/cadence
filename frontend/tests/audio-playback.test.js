import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderNotesWav,
  createNotePlayback,
  createMediaPlayback,
  slicePlaybackWav,
  AUDIO_HELP,
} from "../src/audio-playback.js";
const notes = [
  { pitch: 60, start: 0.1, duration: 0.2 },
  { pitch: 64, start: 0.1, duration: 0.2 },
];

test("media WAV contains audible chord samples, onset silence, and the correct sample rate", () => {
  const wav = renderNotesWav(notes),
    view = new DataView(wav);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint16(22, true), 1);
  for (let i = 0; i < 2000; i++)
    assert.equal(view.getInt16(44 + i * 2, true), 0);
  let peak = 0;
  for (let offset = 44; offset < view.byteLength; offset += 2)
    peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
  assert.ok(peak > 1000);
  assert.ok(peak < 32767);
  assert.throws(() => renderNotesWav([{ pitch: 60, start: NaN, duration: 1 }]));
});

function fakeAudio(t, { reject = false } = {}) {
  const original = globalThis.Audio,
    sessionDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    );
  const elements = [],
    revoked = [];
  globalThis.Audio = class {
    constructor() {
      elements.push(this);
      this.currentTime = 0;
      this.paused = true;
    }
    set src(value) {
      this._src = value;
      this.playbackRate = this.defaultPlaybackRate ?? 1;
    }
    get src() {
      return this._src;
    }
    setAttribute() {}
    removeAttribute() {
      this.src = "";
    }
    load() {}
    play() {
      this.playCalled = true;
      this.paused = false;
      return reject ? Promise.reject(Error("blocked")) : Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { audioSession: { type: "auto" } },
  });
  t.mock.method(URL, "createObjectURL", () => `blob:test-${elements.length}`);
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  t.after(() => {
    globalThis.Audio = original;
    if (sessionDescriptor)
      Object.defineProperty(globalThis, "navigator", sessionDescriptor);
    else delete globalThis.navigator;
  });
  return { elements, revoked };
}

test("phone playback starts in the gesture without AudioContext and requests media routing", async (t) => {
  const { elements, revoked } = fakeAudio(t);
  let ended = 0;
  const player = createNotePlayback(notes, { onEnded: () => ended++ });
  assert.equal(elements[0].playCalled, true);
  assert.equal(navigator.audioSession.type, "playback");
  assert.equal(elements[0].playsInline, true);
  assert.match(elements[0].src, /^blob:/);
  await player.ready;
  elements[0].onended();
  assert.equal(ended, 1);
  assert.equal(navigator.audioSession.type, "auto");
  assert.equal(player.state, "closed");
  assert.equal(revoked.length, 1);
  player.close();
  assert.equal(revoked.length, 1);
});

test("starting another button stops the prior player and releases its media URL", async (t) => {
  const { elements, revoked } = fakeAudio(t);
  let stopped = 0;
  const first = createNotePlayback(notes, { onStop: () => stopped++ });
  await first.ready;
  const second = createNotePlayback(notes);
  await second.ready;
  assert.equal(first.state, "closed");
  assert.equal(elements[0].paused, true);
  assert.equal(stopped, 1);
  second.close();
  second.close();
  assert.equal(revoked.length, 2);
});

test("blocked phone playback rejects clearly and frees its media URL", async (t) => {
  const { revoked } = fakeAudio(t, { reject: true });
  const player = createNotePlayback(notes);
  await assert.rejects(player.ready, (error) => error.message === AUDIO_HELP);
  assert.equal(player.state, "closed");
  assert.equal(revoked.length, 1);
});

test("count-in audio pads the final beat and repeats only the chosen musical range", async (t) => {
  const { elements, revoked } = fakeAudio(t);
  const note = { pitch: 84, start: 1.5, duration: 0.025 };
  const wav = renderNotesWav([note], 22050, 2);
  assert.equal(new DataView(wav).getUint32(40, true), 2 * 22050 * 2);
  const player = createNotePlayback([note], {
    duration: 3,
    start: 0,
    loopStart: 2,
    end: 3,
    loop: true,
  });
  t.after(() => player.close());
  await player.ready;
  assert.equal(elements.length, 2);
  assert.equal(player.element.loop, true);
  assert.equal(player.element.muted, true);
  elements[1].onended();
  assert.equal(player.element.muted, false);
  assert.equal(elements[1].paused, true);
  assert.equal(player.state, "running");
  assert.equal(navigator.audioSession.type, "playback");
  player.close();
  assert.equal(revoked.length, 2);
  assert.equal(navigator.audioSession.type, "auto");
});

test("an original-audio loop beyond the recording fails clearly instead of replaying forever", async (t) => {
  fakeAudio(t);
  const errors = [];
  const player = createMediaPlayback(new Blob(["original"]), {
    start: 2,
    end: 3,
    loop: true,
    onError: (error) => errors.push(error.message),
  });
  await player.ready;
  player.element.duration = 1;
  player.element.onloadedmetadata();
  assert.equal(player.state, "closed");
  assert.match(errors[0], /loop extends beyond/);
});

test("loop WAV has an exact period, no appended release tail, and quiet edges", () => {
  const wav = renderNotesWav([{ pitch: 60, start: 0, duration: 2 }]);
  const loop = slicePlaybackWav(wav, 0.2, 0.8),
    view = new DataView(loop);
  assert.equal(view.getUint32(40, true), Math.round(0.6 * 22050) * 2);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(loop.byteLength - 2, true), 0);
  assert.throws(() => slicePlaybackWav(wav, 3, 4));
});
test("loops use native repeat without seeking the original timeline", async (t) => {
  fakeAudio(t);
  const player = createNotePlayback(notes, { duration: 1, loop: true, end: 1 });
  t.after(() => player.close());
  await player.ready;
  assert.equal(player.element.loop, true);
  assert.equal(player.element.currentTime, 0);
});

test("a blocked count-in closes both elements and restores phone routing", async (t) => {
  const { elements, revoked } = fakeAudio(t, { reject: true });
  const player = createNotePlayback(notes, {
    duration: 3,
    loopStart: 2,
    end: 3,
    loop: true,
  });
  t.after(() => player.close());
  await assert.rejects(player.ready);
  assert.equal(elements.length, 2);
  assert.ok(elements.every((element) => element.paused));
  assert.equal(revoked.length, 2);
  assert.equal(navigator.audioSession.type, "auto");
});

test("original audio keeps its selected speed when the source loads", async (t) => {
  fakeAudio(t);
  const player = createMediaPlayback(new Blob(["original"]), { rate: 0.5 });
  t.after(() => player.close());
  await player.ready;
  assert.equal(player.element.playbackRate, 0.5);
  assert.equal(player.element.defaultPlaybackRate, 0.5);
});
