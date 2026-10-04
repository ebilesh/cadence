import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav, startMidiCapture, permissionRequest} from '../src/capture.js';

test('WAV header, sample rate, clipping, and sample count', () => {
  const view = new DataView(encodeWav([new Float32Array([-2, 0, .5, 2])], 48000));
  assert.equal(view.byteLength, 52);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -32767);
  assert.equal(view.getInt16(50, true), 32767);
});
test('MIDI note-off, zero velocity, held notes, channels, and cleanup', () => {
  const input = {id: 'test'}, access = {inputs: new Map([['test', input]])};
  let time = 1000, count = 0;
  const capture = startMidiCapture(access, value => count = value, () => time);
  const send = data => input.onmidimessage({data});
  send([144,60,90]); time += 200; send([128,60,0]);
  send([145,64,90]); time += 100; send([145,64,0]);
  send([144,67,90]); time += 400;
  const notes = capture.stop();
  assert.deepEqual(notes.map(n => n.pitch), [60,64,67]);
  assert.equal(count, 3); assert.equal(input.onmidimessage, null);
  assert.ok(Math.abs(notes[2].duration - .4) < 1e-9);
  assert.equal(capture.stop(), notes);
});
test('pending permissions time out and release a late stream', async () => {
  let resolve, released = false;
  const pending = new Promise(done => resolve = done);
  await assert.rejects(permissionRequest(pending, 'Permission pending', 5, () => released = true), /Permission pending/);
  resolve({}); await Promise.resolve(); assert.equal(released, true);
});
