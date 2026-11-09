// Salamander Grand Piano, Alexander Holm, CC BY 3.0. See public/licenses.
let bank = [],
  pending;
export function decodePianoWav(buffer) {
  const view = new DataView(buffer);
  let rate, data, frames;
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const name = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    const size = view.getUint32(offset + 4, true),
      first = offset + 8;
    if (first + size > buffer.byteLength) throw Error("Invalid piano sample.");
    if (name === "fmt ") {
      if (
        view.getUint16(first, true) !== 1 ||
        view.getUint16(first + 2, true) !== 1 ||
        view.getUint16(first + 14, true) !== 16
      )
        throw Error("Unsupported piano sample.");
      rate = view.getUint32(first + 4, true);
    }
    if (name === "data") {
      data = first;
      frames = size / 2;
    }
    offset = first + size + (size % 2);
  }
  if (!rate || data === undefined || !frames)
    throw Error("Invalid piano sample.");
  const samples = Float32Array.from(
    { length: frames },
    (_, i) => view.getInt16(data + 2 * i, true) / 32768,
  );
  return { samples, rate };
}
export function loadPianoSamples() {
  if (!pending)
    pending = Promise.all(
      Array.from({ length: 7 }, async (_, i) => {
        const response = await fetch(`/instruments/grand-piano/C${i + 1}.wav`);
        if (!response.ok) throw Error("Piano samples unavailable.");
        return {
          ...decodePianoWav(await response.arrayBuffer()),
          pitch: 24 + i * 12,
        };
      }),
    )
      .then((samples) => {
        bank = samples;
        return samples;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  return pending;
}
export function pianoSample(pitch) {
  return bank.reduce(
    (best, sample) =>
      !best || Math.abs(sample.pitch - pitch) < Math.abs(best.pitch - pitch)
        ? sample
        : best,
    null,
  );
}
