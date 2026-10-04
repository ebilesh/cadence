export function encodeWav(chunks, sampleRate) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (offset, value) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 32767, true);
      offset += 2;
    }
  return view.buffer;
}

export async function permissionRequest(
  promise,
  message,
  timeout = 15000,
  release = () => {},
) {
  let expired = false,
    timer;
  // A late microphone approval must not leave a stream running after timeout.
  promise.then(
    (value) => {
      if (expired) release(value);
    },
    () => {},
  );
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(Error(message));
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function startAudioRecording(stream) {
  const context = new AudioContext();
  let source,
    processor,
    stopped = false;
  const chunks = [];
  try {
    await context.audioWorklet.addModule("/recorder-worklet.js");
    await context.resume();
    source = context.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(context, "pcm-recorder");
    source.connect(processor);
    processor.connect(context.destination);
    processor.port.onmessage = (event) => chunks.push(event.data);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    throw error;
  }
  return {
    async stop() {
      if (stopped) return null;
      stopped = true;
      processor.disconnect();
      source.disconnect();
      processor.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      return new File(
        [encodeWav(chunks, context.sampleRate)],
        "microphone.wav",
        { type: "audio/wav" },
      );
    },
  };
}

export function startMidiCapture(
  access,
  onCount,
  now = () => performance.now(),
) {
  const start = now(),
    notes = [],
    held = new Map();
  let stopped = false;
  const finish = (key, time) => {
    const note = held.get(key);
    if (note && notes.length < 600) {
      notes.push({ ...note, duration: Math.max(0.01, time - note.start) });
      onCount(notes.length);
    }
    held.delete(key);
  };
  for (const input of access.inputs.values())
    input.onmidimessage = (event) => {
      if (stopped) return;
      const [status, pitch, velocity] = event.data;
      const command = status & 0xf0,
        key = `${input.id}:${status & 0x0f}:${pitch}`;
      const time = Math.min(119, (now() - start) / 1000);
      if (command === 144 && velocity > 0) {
        if (held.has(key)) finish(key, time);
        if (notes.length + held.size < 600)
          held.set(key, { pitch, start: time });
      } else if (command === 128 || (command === 144 && velocity === 0))
        finish(key, time);
    };
  return {
    stop() {
      if (stopped) return notes;
      stopped = true;
      const time = Math.min(119, (now() - start) / 1000);
      for (const key of held.keys()) finish(key, time);
      for (const input of access.inputs.values()) input.onmidimessage = null;
      return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    },
  };
}
