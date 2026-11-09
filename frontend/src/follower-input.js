import { permissionRequest } from "./capture.js";
import { detectPitch } from "./follower.js";

// Own only the handlers installed here; detach them on stop and hot-unplug.
export function connectMidiFollower(access, onChord, onStatus, delay = 65) {
  let stopped = false,
    timer = null,
    pitches = new Set();
  const attached = new Map();
  const flush = () => {
    timer = null;
    if (!stopped && pitches.size) onChord([...pitches]);
    pitches.clear();
  };
  const detach = ({ input, previous, handler, events }) => {
    if (events) input.removeEventListener("midimessage", handler);
    else if (input.onmidimessage === handler) input.onmidimessage = previous;
  };
  const attach = () => {
    if (stopped) return;
    for (const [id, entry] of attached) {
      if (
        access.inputs.get(id) !== entry.input ||
        entry.input.state === "disconnected"
      ) {
        detach(entry);
        attached.delete(id);
      }
    }
    for (const input of access.inputs.values()) {
      if (input.state === "disconnected" || attached.has(input.id)) continue;
      const previous = input.onmidimessage;
      const handler = (event) => {
        if (stopped) return;
        const [status, pitch, velocity] = event.data;
        if ((status & 0xf0) === 0x90 && velocity > 0) {
          pitches.add(pitch);
          if (!timer) timer = setTimeout(flush, delay);
        }
      };
      const events = typeof input.addEventListener === "function";
      if (events) input.addEventListener("midimessage", handler);
      else input.onmidimessage = handler;
      attached.set(input.id, { input, previous, handler, events });
    }
    if (!attached.size) {
      clearTimeout(timer);
      timer = null;
      pitches.clear();
    }
    onStatus(
      attached.size
        ? `Listening to ${attached.size} MIDI input${attached.size === 1 ? "" : "s"}.`
        : "No MIDI input connected. Plug in your keyboard to continue.",
    );
  };
  const previousState = access.onstatechange;
  access.onstatechange = attach;
  attach();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      pitches.clear();
      for (const entry of attached.values()) detach(entry);
      attached.clear();
      if (access.onstatechange === attach) access.onstatechange = previousState;
    },
  };
}

export async function connectMicrophoneFollower(
  onPitch,
  onStatus,
  suppliedStream,
) {
  const stream =
    suppliedStream ||
    (await permissionRequest(
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      }),
      "Microphone permission timed out. Allow access and try again.",
      15000,
      (late) => late.getTracks().forEach((t) => t.stop()),
    ));
  let context,
    source,
    analyser,
    timer,
    stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    source?.disconnect();
    analyser?.disconnect();
    if (context && context.state !== "closed") void context.close();
  };
  try {
    context = new AudioContext();
    await context.resume();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let previous = null,
      stable = 0,
      emitted = null,
      silence = 0;
    timer = setInterval(() => {
      if (stopped) return;
      analyser.getFloatTimeDomainData(samples);
      const found = detectPitch(samples, context.sampleRate);
      if (!found) {
        stable = 0;
        previous = null;
        if (++silence >= 2) emitted = null;
        return;
      }
      silence = 0;
      stable = found.pitch === previous ? stable + 1 : 1;
      previous = found.pitch;
      if (stable >= 2 && emitted !== found.pitch) {
        emitted = found.pitch;
        onPitch([found.pitch]);
      }
    }, 60);
    stream.getTracks().forEach((track) =>
      track.addEventListener(
        "ended",
        () => {
          stop();
          onStatus("Microphone disconnected. Stop and reconnect to continue.");
        },
        { once: true },
      ),
    );
    onStatus(
      "Listening for the top note of each chord, C3–C6. Release between repeated notes.",
    );
    return { stop };
  } catch (error) {
    stop();
    throw error;
  }
}
