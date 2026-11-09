import { pianoSample } from "./piano-samples.js";
import { encodeWav } from "./capture.js";

export const AUDIO_HELP =
  "Audio could not start. Open the site in Safari or Chrome, turn up media volume, and tap Play again.";
let activePlayback = null;

// Render small practice passages to PCM, then use the phone's media playback
// route. This does not require a running/unlocked Web Audio context for sound.
export function renderNotesWav(
  notes,
  sampleRate = 22050,
  minimumDuration = 0,
  instrument = "grand",
) {
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
    const sample =
      instrument === "grand" && note.instrument !== "click"
        ? pianoSample(note.pitch)
        : null;
    const sampleStep = sample
      ? (sample.rate / sampleRate) * 2 ** ((note.pitch - sample.pitch) / 12)
      : 0;
    let phase = 0,
      gain = 0.18;
    for (let i = 0; i < frames && first + i < length; i++) {
      const t = i / sampleRate,
        envelope =
          Math.min(1, t / 0.008) *
          Math.max(0, Math.min(1, (note.duration + 0.05 - t) / 0.05));
      let value;
      if (note.instrument === "click") {
        // A short unpitched tick, with no high/low note at the loop seam.
        value =
          ((Math.sin(i * 127.1) * 43758.5453) % 1) * Math.exp(-t * 220) * 0.22;
      } else if (sample) {
        const position = i * sampleStep,
          index = Math.floor(position),
          fraction = position - index;
        value =
          ((sample.samples[index] || 0) * (1 - fraction) +
            (sample.samples[index + 1] || 0) * fraction) *
          0.65 *
          envelope;
      } else value = (4 * Math.abs(phase - 0.5) - 1) * gain * envelope;
      samples[first + i] += value;
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

// Cut our own PCM WAV at exact sample boundaries. A short edge fade prevents
// a held note from producing a discontinuity at the wrap; no release tail is
// added to the period itself.
export function slicePlaybackWav(wav, start, end) {
  const input = new DataView(wav),
    rate = input.getUint32(24, true);
  const first = Math.round(start * rate),
    last = Math.round(end * rate),
    available = input.getUint32(40, true) / 2;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    first < 0 ||
    last <= first ||
    last > available
  )
    throw Error("Choose a valid loop within the recording.");
  const out = new ArrayBuffer(44 + (last - first) * 2),
    bytes = new Uint8Array(out);
  bytes.set(new Uint8Array(wav, 0, 44));
  bytes.set(new Uint8Array(wav, 44 + first * 2, (last - first) * 2), 44);
  const view = new DataView(out);
  view.setUint32(4, out.byteLength - 8, true);
  view.setUint32(40, out.byteLength - 44, true);
  const fade = Math.min(
    Math.round(rate * 0.002),
    Math.floor((last - first) / 2),
  );
  for (let i = 0; i < fade; i++)
    for (const frame of [i, last - first - 1 - i])
      view.setInt16(
        44 + frame * 2,
        Math.round((view.getInt16(44 + frame * 2, true) * i) / fade),
        true,
      );
  return out;
}

function playbackRoute() {
  const session = globalThis.navigator?.audioSession;
  let previous,
    changed = false;
  try {
    previous = session?.type;
    if (session && previous !== "play-and-record") {
      session.type = "playback";
      changed = true;
    }
  } catch {}
  return () => {
    try {
      if (changed && session.type === "playback") session.type = previous;
    } catch {}
  };
}

export function createNotePlayback(notes, options = {}) {
  const wav = renderNotesWav(
    notes,
    22050,
    Math.max(options.duration || 0, options.end || 0),
    options.instrument,
  );
  if (!options.loop)
    return createMediaPlayback(new Blob([wav], { type: "audio/wav" }), options);
  const rate = new DataView(wav).getUint32(24, true),
    start = options.start || 0;
  const bodyStart = options.loopStart ?? start,
    end = options.end ?? options.duration ?? (wav.byteLength - 44) / 2 / rate;
  const body = slicePlaybackWav(wav, bodyStart, end);
  const callbacks = {
    onEnded: options.onEnded || (() => {}),
    onStop: options.onStop || (() => {}),
    onError: options.onError || (() => {}),
    onTick: options.onTick || (() => {}),
  };
  if (bodyStart === start)
    return createMediaPlayback(new Blob([body], { type: "audio/wav" }), {
      ...options,
      start: 0,
      loopStart: 0,
      end: null,
      loop: true,
      onTick: (time) => callbacks.onTick(bodyStart + time),
    });
  // Prime both media elements within the tap. The loop plays silently during
  // the one-time count-in, then becomes audible without another play request.
  const intro = slicePlaybackWav(wav, start, bodyStart);
  activePlayback?.close();
  const restore = playbackRoute();
  let closed = false,
    introDone = false,
    bodyPlayer,
    introPlayer;
  const cleanup = () => {
    if (closed) return false;
    closed = true;
    bodyPlayer?.close();
    introPlayer?.close();
    restore();
    if (activePlayback === group) activePlayback = null;
    return true;
  };
  const fail = (error) => {
    if (cleanup()) callbacks.onError(error);
  };
  const group = {
    get element() {
      return bodyPlayer.element;
    },
    get state() {
      return closed ? "closed" : "running";
    },
    setRate(rate) {
      if (closed) return;
      bodyPlayer.setRate(rate);
      introPlayer.setRate(rate);
    },
    close() {
      if (cleanup()) callbacks.onStop();
    },
  };
  activePlayback = group;
  try {
    bodyPlayer = createMediaPlayback(new Blob([body], { type: "audio/wav" }), {
      exclusive: false,
      manageSession: false,
      muted: true,
      start: 0,
      loopStart: 0,
      end: null,
      loop: true,
      onError: fail,
      onTick: (time) => {
        if (introDone) callbacks.onTick(bodyStart + time);
      },
    });
    introPlayer = createMediaPlayback(
      new Blob([intro], { type: "audio/wav" }),
      {
        exclusive: false,
        manageSession: false,
        onError: fail,
        onTick: (time) => callbacks.onTick(start + time),
        onEnded: () => {
          if (!closed) {
            introDone = true;
            bodyPlayer.element.currentTime = 0;
            bodyPlayer.element.muted = false;
            callbacks.onTick(bodyStart + bodyPlayer.element.currentTime);
          }
        },
      },
    );
    group.ready = Promise.all([bodyPlayer.ready, introPlayer.ready])
      .then(() => undefined)
      .catch((error) => {
        cleanup();
        throw error;
      });
    return group;
  } catch (error) {
    cleanup();
    throw error;
  }
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
    exclusive = true,
    manageSession = true,
    muted = false,
  } = {},
) {
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(rate) ||
    rate < 0.025 ||
    rate > 12 ||
    (end !== null && (!Number.isFinite(end) || end <= start)) ||
    (loopStart !== null &&
      (!Number.isFinite(loopStart) ||
        loopStart < start ||
        (end !== null && loopStart >= end)))
  )
    throw Error("Choose a valid playback range and speed.");
  if (exclusive) activePlayback?.close();
  const element = new Audio();
  try {
    element.defaultPlaybackRate = rate;
    element.playbackRate = rate;
  } catch {
    throw Error(
      "This browser cannot play original audio at that tempo. Choose a speed closer to 100% or use detected notes.",
    );
  }
  const restoreSession = manageSession ? playbackRoute() : () => {};
  element.preload = "auto";
  element.playsInline = true;
  element.setAttribute("playsinline", "");
  element.volume = 1;
  element.muted = muted;
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
    restoreSession();
    if (activePlayback === playback) activePlayback = null;
    return true;
  };
  const playback = {
    element,
    get state() {
      return closed ? "closed" : "running";
    },
    setRate(value) {
      if (closed) return;
      if (!Number.isFinite(value) || value < 0.025 || value > 12)
        throw Error("Choose a tempo closer to the current playback speed.");
      element.defaultPlaybackRate = value;
      element.playbackRate = value;
    },
    close() {
      if (cleanup()) onStop();
    },
  };
  if (exclusive) activePlayback = playback;
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
