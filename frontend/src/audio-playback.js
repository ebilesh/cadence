import { encodeWav } from "./capture.js";

export const AUDIO_HELP =
  "Audio could not start. Open the site in Safari or Chrome, turn up media volume, and tap Play again.";
let activePlayback = null;

// Render small practice passages to PCM, then use the phone's media playback
// route. This does not require a running/unlocked Web Audio context for sound.
export function renderNotesWav(notes, sampleRate = 22050) {
  if (
    !Array.isArray(notes) ||
    !notes.length ||
    notes.length > 2000 ||
    notes.some(
      (n) =>
        !n ||
        !Number.isInteger(n.pitch) ||
        n.pitch < 0 ||
        n.pitch > 127 ||
        !Number.isFinite(n.start) ||
        n.start < 0 ||
        !Number.isFinite(n.duration) ||
        n.duration <= 0 ||
        n.start + n.duration > 125,
    ) ||
    notes.reduce((s, n) => s + n.duration, 0) > 2400
  )
    throw Error("Choose a shorter passage for audio playback.");
  const length = Math.ceil(
    (Math.max(...notes.map((n) => n.start + n.duration)) + 0.06) * sampleRate,
  );
  const samples = new Float32Array(length);
  for (const note of notes) {
    const first = Math.round(note.start * sampleRate),
      frames = Math.ceil((note.duration + 0.05) * sampleRate);
    const step = (440 * 2 ** ((note.pitch - 69) / 12)) / sampleRate,
      decay = Math.exp(-2 / (Math.max(note.duration, 0.2) * sampleRate));
    let phase = 0,
      gain = 0.18;
    for (let i = 0; i < frames && first + i < length; i++) {
      const t = i / sampleRate,
        envelope =
          Math.min(1, t / 0.008) *
          Math.max(0, Math.min(1, (note.duration + 0.05 - t) / 0.05));
      samples[first + i] += (4 * Math.abs(phase - 0.5) - 1) * gain * envelope;
      phase = (phase + step) % 1;
      gain *= decay;
    }
  }
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak > 0.9)
    for (let i = 0; i < samples.length; i++) samples[i] *= 0.9 / peak;
  return encodeWav([samples], sampleRate);
}

export function createNotePlayback(
  notes,
  { onEnded = () => {}, onError = () => {}, onStop = () => {} } = {},
) {
  const wav = renderNotesWav(notes);
  activePlayback?.close();
  // Newer iOS versions expose an explicit media session route. Audio elements
  // remain the compatibility path when that API is absent or read-only.
  const session = globalThis.navigator?.audioSession;
  let previousType,
    changedSession = false;
  try {
    previousType = session?.type;
    if (session && previousType !== "play-and-record") {
      session.type = "playback";
      changedSession = true;
    }
  } catch {}
  const element = new Audio();
  element.preload = "auto";
  element.playsInline = true;
  element.setAttribute("playsinline", "");
  element.volume = 1;
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  element.src = url;
  let closed = false;
  const cleanup = () => {
    if (closed) return false;
    closed = true;
    element.onended = null;
    element.onerror = null;
    element.pause();
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(url);
    try {
      if (changedSession && session.type === "playback")
        session.type = previousType;
    } catch {}
    if (activePlayback === playback) activePlayback = null;
    return true;
  };
  const playback = {
    element,
    get state() {
      return closed ? "closed" : "running";
    },
    close() {
      if (cleanup()) onStop();
    },
  };
  activePlayback = playback;
  element.onended = () => {
    if (cleanup()) onEnded();
  };
  element.onerror = () => {
    if (cleanup()) onError(Error(AUDIO_HELP));
  };
  try {
    // Call play synchronously in the click handler: iOS user activation must
    // not be lost behind a timer, fetch, or audio-context resume await.
    playback.ready = Promise.resolve(element.play()).catch((error) => {
      cleanup();
      throw Error(AUDIO_HELP, { cause: error });
    });
  } catch (error) {
    cleanup();
    throw Error(AUDIO_HELP, { cause: error });
  }
  return playback;
}
