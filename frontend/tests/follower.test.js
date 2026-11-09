import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ScoreFollower,
  groupScore,
  DEMO_NOTES,
  detectPitch,
  saveSession,
  restoreSession,
  CHECKPOINT_KEY,
} from "../src/follower.js";
import { connectMidiFollower } from "../src/follower-input.js";
const memory = () => {
  const data = new Map();
  return {
    setItem: (k, v) => data.set(k, v),
    getItem: (k) => data.get(k) || null,
  };
};

test("accuracy: reordered chords match 8/8; wrong pitches never advance", () => {
  const f = new ScoreFollower(DEMO_NOTES);
  for (const [i, g] of f.groups.entries()) {
    const before = f.position;
    f.observe([90]);
    assert.equal(f.position, before);
    f.observe([...g.pitches].reverse());
    assert.equal(f.position, i);
  }
  assert.equal(f.matched, 8);
  assert.equal(f.skipped, 0);
  assert.equal(f.rejected, 8);
});
test("missing attack recovery stays local and prefers the nearest repetition", () => {
  const f = new ScoreFollower(DEMO_NOTES);
  f.observe(f.groups[1].pitches);
  assert.equal(f.position, 1);
  assert.equal(f.skipped, 1);
  f.observe(f.groups[7].pitches);
  assert.equal(f.position, 3);
  const distant = new ScoreFollower(DEMO_NOTES);
  distant.observe(distant.groups[5].pitches);
  assert.equal(distant.position, -1);
});
test("restart preserves position, metrics, completion and next attack", () => {
  const storage = memory(),
    f = new ScoreFollower(DEMO_NOTES);
  f.observe(f.groups[0].pitches);
  f.observe(f.groups[1].pitches);
  saveSession(storage, DEMO_NOTES, "Study", f);
  const restored = restoreSession(storage);
  assert.equal(restored.follower.position, 1);
  restored.follower.observe(restored.follower.groups[2].pitches);
  assert.equal(restored.follower.position, 2);
  assert.equal(restored.follower.matched, 3);
  const complete = new ScoreFollower(DEMO_NOTES);
  complete.groups.forEach((g) => complete.observe(g.pitches));
  saveSession(storage, DEMO_NOTES, "Complete", complete);
  assert.equal(restoreSession(storage).follower.position, 7);
});
test("corrupt or incompatible checkpoints and unavailable storage are safe", () => {
  assert.equal(
    restoreSession({
      getItem() {
        throw Error("blocked");
      },
    }),
    null,
  );
  assert.equal(restoreSession({ getItem: () => "{" }), null);
  const f = new ScoreFollower(DEMO_NOTES),
    cp = { ...f.snapshot(), position: 999, matched: 1000 };
  assert.equal(new ScoreFollower(DEMO_NOTES, cp).position, -1);
  cp.position = 0;
  cp.matched = 1;
  cp.version = 2;
  assert.equal(new ScoreFollower(DEMO_NOTES, cp).position, -1);
  cp.version = 1;
  cp.signature = "another score";
  assert.equal(new ScoreFollower(DEMO_NOTES, cp).position, -1);
  assert.throws(
    () =>
      saveSession(
        {
          setItem() {
            throw Error("quota");
          },
        },
        DEMO_NOTES,
        "x",
        f,
      ),
    /quota/,
  );
  const storage = memory();
  storage.setItem(
    CHECKPOINT_KEY,
    JSON.stringify({ name: "Bad", notes: [{ pitch: null }] }),
  );
  assert.equal(restoreSession(storage), null);
});
test("score bounds and anchored onset grouping", () => {
  assert.deepEqual(
    groupScore(
      [0, 0.04, 0.08].map((start) => ({ start, pitch: 60, duration: 0.1 })),
    ).map((g) => g.start),
    [0, 0.08],
  );
  for (const bad of [
    [],
    [{ pitch: 60, start: NaN, duration: 1 }],
    [{ pitch: 128, start: 0, duration: 1 }],
    [{ pitch: 60, start: 120, duration: 1 }],
  ])
    assert.throws(() => new ScoreFollower(bad));
});
test("microphone follows the top voice and rejects lower chord tones", () => {
  const f = new ScoreFollower(DEMO_NOTES);
  f.observe([60], "microphone");
  assert.equal(f.position, -1);
  f.groups.forEach((g) => f.observe([Math.max(...g.pitches)], "microphone"));
  assert.equal(f.matched, 8);
});
test("pitch accuracy: 22 synthetic tones across 3 octaves and 2 sample rates; silence and noise rejected", () => {
  for (const sampleRate of [44100, 48000])
    for (const pitch of [48, 52, 57, 60, 64, 67, 69, 72, 76, 81, 84]) {
      const hz = 440 * 2 ** ((pitch - 69) / 12);
      const samples = Float32Array.from(
        { length: 4096 },
        (_, i) =>
          0.3 * Math.sin((2 * Math.PI * hz * i) / sampleRate) +
          0.08 * Math.sin((4 * Math.PI * hz * i) / sampleRate),
      );
      assert.equal(
        detectPitch(samples, sampleRate)?.pitch,
        pitch,
        `${sampleRate}Hz MIDI ${pitch}`,
      );
    }
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
  let seed = 17;
  const noise = Float32Array.from({ length: 4096 }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 0.5;
  });
  assert.equal(detectPitch(noise, 48000), null);
});
test("MIDI batches attacks, filters zero velocity, survives hotplug, stops and restarts", async () => {
  const input = { id: "a", state: "connected", onmidimessage: null },
    access = { inputs: new Map(), onstatechange: null };
  access.inputs.set("a", input);
  const seen = [],
    statuses = [];
  let session = connectMidiFollower(
    access,
    (p) => seen.push(p),
    (s) => statuses.push(s),
    5,
  );
  input.onmidimessage({ data: [144, 67, 90] });
  input.onmidimessage({ data: [145, 60, 80] });
  input.onmidimessage({ data: [144, 64, 0] });
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(seen, [[67, 60]]);
  input.state = "disconnected";
  access.onstatechange();
  assert.equal(input.onmidimessage, null);
  input.state = "connected";
  access.onstatechange();
  input.onmidimessage({ data: [144, 64, 90] });
  session.stop();
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(seen.length, 1);
  assert.equal(access.onstatechange, null);
  assert.equal(input.onmidimessage, null);
  session = connectMidiFollower(
    access,
    (p) => seen.push(p),
    () => {},
    5,
  );
  input.onmidimessage({ data: [144, 72, 80] });
  await new Promise((r) => setTimeout(r, 15));
  session.stop();
  session.stop();
  assert.equal(seen.length, 2);
  assert.ok(statuses.some((s) => s.includes("No MIDI")));
});

test("native MIDI listeners coexist with capture handlers and detach on stop", async () => {
  const input = new EventTarget();
  Object.assign(input, { id: "native", state: "connected" });
  const captureHandler = () => {};
  input.onmidimessage = captureHandler;
  const access = { inputs: new Map([["native", input]]) },
    seen = [];
  const session = connectMidiFollower(
    access,
    (p) => seen.push(p),
    () => {},
    2,
  );
  const send = () => {
    const event = new Event("midimessage");
    event.data = [144, 60, 90];
    input.dispatchEvent(event);
  };
  send();
  await new Promise((r) => setTimeout(r, 10));
  session.stop();
  send();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.length, 1);
  assert.equal(input.onmidimessage, captureHandler);
});

test("seeking starts fresh counts and restores the chosen attack without inventing misses", () => {
  const f = new ScoreFollower(DEMO_NOTES);
  f.observe(f.groups[0].pitches);
  f.seek(4);
  assert.equal(f.position, 3);
  assert.equal(f.matched, 0);
  assert.equal(f.skipped, 0);
  const storage = memory();
  saveSession(storage, DEMO_NOTES, "Study", f);
  const recovered = restoreSession(storage).follower;
  assert.equal(recovered.start, 4);
  assert.equal(recovered.position, 3);
  recovered.observe(recovered.groups[4].pitches);
  assert.equal(recovered.matched, 1);
  assert.equal(recovered.skipped, 0);
  for (const bad of [-1, 8, 1.5, NaN])
    assert.throws(() => f.seek(bad), RangeError);
});

test("legacy checkpoints restore and consecutive mismatch guidance resets after a match", () => {
  const f = new ScoreFollower(DEMO_NOTES);
  f.observe(f.groups[0].pitches);
  const old = f.snapshot();
  delete old.start;
  delete old.unmatchedStreak;
  const recovered = new ScoreFollower(DEMO_NOTES, old);
  assert.equal(recovered.position, 0);
  assert.equal(recovered.start, 0);
  for (let i = 0; i < 3; i++) recovered.observe([90]);
  assert.equal(recovered.unmatchedStreak, 3);
  recovered.observe(recovered.groups[1].pitches);
  assert.equal(recovered.unmatchedStreak, 0);
  assert.equal(recovered.rejected, 3);
  recovered.seek(0);
  assert.equal(recovered.rejected, 0);
});

test("disconnecting one MIDI device drops its pending tones while other devices continue", async () => {
  const a = { id: "a", state: "connected" },
    b = { id: "b", state: "connected" };
  const access = {
      inputs: new Map([
        ["a", a],
        ["b", b],
      ]),
    },
    seen = [];
  const session = connectMidiFollower(
    access,
    (p) => seen.push(p),
    () => {},
    5,
  );
  a.onmidimessage({ data: [144, 90, 90] });
  b.onmidimessage({ data: [144, 60, 90] });
  a.state = "disconnected";
  access.onstatechange();
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(seen, [[60]]);
  assert.equal(a.onmidimessage, undefined);
  session.stop();
});

test("MIDI state listeners coexist with other consumers and are removed on stop", () => {
  const access = new EventTarget();
  access.inputs = new Map();
  const previous = () => {};
  access.onstatechange = previous;
  const statuses = [];
  const session = connectMidiFollower(
    access,
    () => {},
    (s) => statuses.push(s),
  );
  access.dispatchEvent(new Event("statechange"));
  assert.equal(statuses.length, 2);
  session.stop();
  access.dispatchEvent(new Event("statechange"));
  assert.equal(statuses.length, 2);
  assert.equal(access.onstatechange, previous);
});

test("microphone disconnect releases resources once and signals the owner", async () => {
  const { connectMicrophoneFollower } =
    await import("../src/follower-input.js");
  const original = globalThis.AudioContext;
  let closes = 0,
    ended = 0;
  globalThis.AudioContext = class {
    state = "running";
    sampleRate = 48000;
    async resume() {}
    async close() {
      this.state = "closed";
      closes++;
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 4096,
        getFloatTimeDomainData(a) {
          a.fill(0);
        },
        disconnect() {},
      };
    }
  };
  const track = new EventTarget();
  track.readyState = "live";
  track.stop = () => (track.readyState = "ended");
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  let session;
  try {
    session = await connectMicrophoneFollower(
      () => {},
      () => {},
      stream,
      () => ended++,
    );
    track.readyState = "ended";
    track.dispatchEvent(new Event("ended"));
    track.dispatchEvent(new Event("ended"));
    session.stop();
    assert.equal(ended, 1);
    assert.equal(closes, 1);
    await assert.rejects(
      connectMicrophoneFollower(
        () => {},
        () => {},
        stream,
      ),
      /disconnected/,
    );
  } finally {
    session?.stop();
    globalThis.AudioContext = original;
  }
});
