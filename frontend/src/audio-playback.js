import { encodeWav } from "./capture.js";

export const AUDIO_HELP =
  "Audio could not start. Open the site in Safari or Chrome, turn up media volume, and tap Play again.";
let activePlayback = null;

// Render small practice passages to PCM, then use the phone's media playback
// route. This does not require a running/unlocked Web Audio context for sound.
export function renderNotesWav(notes, sampleRate = 22050, minimumDuration = 0) {
  if (
    !Number.isFinite(minimumDuration) ||
    minimumDuration < 0 ||
    minimumDuration > 500 ||
    !Array.isArray(notes) ||
    !notes.length ||
    notes.length > 4096 ||
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
        n.start + n.duration > 500,
    ) ||
    notes.reduce((s, n) => s + n.duration, 0) > 2400
  )
    throw Error("Choose a shorter passage for audio playback.");
  const length = Math.ceil(
    Math.max(
      minimumDuration,
      Math.max(...notes.map((n) => n.start + n.duration)) + 0.06,
    ) * sampleRate,
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

export function createNotePlayback(notes, options = {}) {
  return createMediaPlayback(
    new Blob([renderNotesWav(notes, 22050, options.duration || 0)], {
      type: "audio/wav",
    }),
    options,
  );
}

export function createMediaPlayback(
  source,
  {
    onEnded = () => {},
    onError = () => {},
    onStop = () => {},
    onTick = () => {},
    start = 0,
    loopStart = null,
    end = null,
    loop = false,
    rate = 1,
  } = {},
) {
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(rate) ||
    rate < 0.25 ||
    rate > 2 ||
    (end !== null && (!Number.isFinite(end) || end <= start)) ||
    (loopStart !== null &&
      (!Number.isFinite(loopStart) ||
        loopStart < start ||
        (end !== null && loopStart >= end)))
  )
    throw Error("Choose a valid playback range and speed.");
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
  const owned = source instanceof Blob;
  const url = owned ? URL.createObjectURL(source) : source;
  element.src = url;
  element.playbackRate = rate;
  element.preservesPitch = true;
  element.webkitPreservesPitch = true;
  element.loop = loop && start === 0 && end === null;
  let closed = false,
    ticker;
  const cleanup = () => {
    if (closed) return false;
    closed = true;
    clearInterval(ticker);
    element.onended = null;
    element.onerror = null;
    element.onloadedmetadata = null;
    element.pause();
    element.removeAttribute("src");
    element.load();
    if (owned) URL.revokeObjectURL(url);
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
  const seekStart = () => {
    try {
      if (
        Number.isFinite(element.duration) &&
        (start >= element.duration ||
          (end !== null && end > element.duration + 0.05))
      )
        throw Error(
          "The loop extends beyond this recording. Choose an earlier start or end.",
        );
      if (start) element.currentTime = start;
    } catch (error) {
      if (cleanup()) onError(error);
    }
  };
  element.onloadedmetadata = seekStart;
  if (element.readyState >= 1) seekStart();
  const finish = () => {
    if (loop && !closed) {
      element.currentTime = loopStart ?? start;
      Promise.resolve(element.play()).catch((error) => {
        if (cleanup()) onError(Error(AUDIO_HELP, { cause: error }));
      });
    } else if (cleanup()) onEnded();
  };
  element.onended = finish;
  ticker = setInterval(() => {
    if (closed) return;
    onTick(element.currentTime);
    if (end !== null && element.currentTime >= end) finish();
  }, 40);
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
