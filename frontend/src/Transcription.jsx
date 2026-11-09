import { loadPianoSamples } from "./piano-samples.js";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Upload,
  Play,
  Square,
  Download,
  Trash2,
  RotateCcw,
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  Music2,
  AudioLines,
  Repeat2,
} from "lucide-react";
import { noteName } from "./follower.js";
import { encodeTranscriptionMidi, validateNotes } from "./transcription.js";
import {
  createNotePlayback,
  createMediaPlayback,
  AUDIO_HELP,
} from "./audio-playback.js";
import {
  historyStart,
  historyEdit,
  historyUndo,
  historyRedo,
  moveNote,
  practiceNotes,
  metronomeNotes,
} from "./studio-core.js";
import {
  saveStudioSession,
  loadStudioSession,
  listStudioSessions,
  deleteStudioSession,
} from "./session-store.js";
import StudioRecorder from "./StudioRecorder.jsx";
import example from "./transcription-demo.json";
import "./transcription.css";
const SheetMusic = lazy(() => import("./SheetMusic.jsx"));
const defaults = {
  speed: 1,
  bpm: 100,
  baseBpm: 100,
  instrument: "grand",
  countIn: 0,
  metronome: false,
  loop: false,
  start: 0,
  end: 3,
};
function safeSettings(value) {
  const s = { ...defaults, ...value };
  try {
    practiceNotes([], { ...s, end: Math.max(0.01, s.end) });
    return s;
  } catch {
    return { ...defaults };
  }
}

export default function Transcription({
  demoOnly = false,
  libraryMode = false,
  active = true,
  onOpenStudio = () => {},
  onOpenReport = () => {},
}) {
  const [result, setResult] = useState(null),
    [history, setHistory] = useState(() => historyStart([])),
    [selected, setSelected] = useState(null),
    [draft, setDraft] = useState(null),
    [title, setTitle] = useState("Untitled take");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [source, setSource] = useState("notes"),
    [original, setOriginal] = useState(null),
    [view, setView] = useState("roll"),
    [prefs, setPrefs] = useState(defaults),
    [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState(null),
    [saveStatus, setSaveStatus] = useState("Not saved"),
    [library, setLibrary] = useState([]),
    [libraryError, setLibraryError] = useState("");
  const request = useRef(null),
    audio = useRef(null),
    mounted = useRef(true),
    generation = useRef(0),
    drag = useRef(null),
    roll = useRef(null),
    current = useRef(null),
    saveTimer = useRef(null),
    writeVersion = useRef(0);
  const [pianoStatus, setPianoStatus] = useState("loading");
  useEffect(() => {
    let alive = true;
    loadPianoSamples()
      .then(() => {
        if (alive) setPianoStatus("ready");
      })
      .catch(() => {
        if (alive) setPianoStatus("unavailable");
      });
    return () => {
      alive = false;
    };
  }, []);
  const notes = history.present;
  const stop = () => {
    audio.current?.close();
    audio.current = null;
    setPlaying(false);
    setProgress(0);
  };
  const showError = (e) => setError(e?.message || String(e));
  current.current = { result, notes, title, original, prefs, sessionId };
  const refreshLibrary = async () => {
    try {
      setLibrary(await listStudioSessions());
      setLibraryError("");
    } catch {
      setLibraryError(
        "Session storage is unavailable. Enable browser storage or export MIDI to keep your work.",
      );
    }
  };
  useEffect(() => {
    mounted.current = true;
    refreshLibrary();
    const token = generation.current;
    let id;
    try {
      id = localStorage.getItem("cadence-studio-last");
    } catch {}
    if (id)
      loadStudioSession(id)
        .then((record) => {
          if (
            mounted.current &&
            generation.current === token &&
            record.kind !== "report"
          )
            restore(record);
        })
        .catch(() => {});
    const hide = () => {
      audio.current?.close();
    };
    window.addEventListener("pagehide", hide);
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
      audio.current?.close();
      clearTimeout(saveTimer.current);
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  useEffect(() => {
    if (!active) stop();
  }, [active]);
  useEffect(() => {
    if (libraryMode) refreshLibrary();
  }, [libraryMode]);
  async function write(record) {
    const version = ++writeVersion.current;
    setSaveStatus("Saving…");
    try {
      await saveStudioSession(record);
      if (mounted.current && writeVersion.current === version)
        setSaveStatus("Saved on this device");
      refreshLibrary();
      return true;
    } catch {
      if (mounted.current) {
        setSaveStatus("Save failed");
        setError(
          "The browser could not save this session. Export MIDI and free browser storage, then retry.",
        );
      }
      return false;
    }
  }
  function recordOf(id) {
    const c = current.current;
    return {
      version: 1,
      id,
      name: c.title.trim().slice(0, 120) || "Untitled take",
      updated: Date.now(),
      notes: c.notes,
      originalNotes: c.result.notes,
      duration: c.result.duration,
      model: c.result.model,
      audio: c.original,
      settings: c.prefs,
    };
  }
  useEffect(() => {
    clearTimeout(saveTimer.current);
    if (!sessionId || !result) return;
    setSaveStatus("Unsaved changes");
    saveTimer.current = setTimeout(() => write(recordOf(sessionId)), 500);
    return () => clearTimeout(saveTimer.current);
  }, [history, title, original, prefs, sessionId]);
  function restore(record) {
    generation.current++;
    writeVersion.current++;
    stop();
    setResult({
      duration: record.duration,
      notes: record.originalNotes,
      model: record.model || "Saved transcription",
    });
    setHistory(historyStart(record.notes));
    setTitle(record.name);
    setOriginal(record.audio || null);
    setPrefs(safeSettings(record.settings));
    setSessionId(record.id);
    setSaveStatus("Saved on this device");
    setSelected(null);
    setDraft(null);
    setError("");
    setSource("notes");
    try {
      localStorage.setItem("cadence-studio-last", record.id);
    } catch {}
  }
  async function openSession(id) {
    try {
      const record = await loadStudioSession(id);
      if (record.kind === "report") onOpenReport(record.report);
      else {
        restore(record);
        onOpenStudio();
      }
    } catch (e) {
      showError(e);
    }
  }
  async function save() {
    if (!result) return;
    clearTimeout(saveTimer.current);
    const id = sessionId || crypto.randomUUID(),
      token = generation.current;
    if (await write(recordOf(id))) {
      if (token !== generation.current) return;
      setSessionId(id);
      try {
        localStorage.setItem("cadence-studio-last", id);
      } catch {}
    }
  }
  async function removeSession(id) {
    const saved = library.find((record) => record.id === id);
    if (
      !window.confirm(
        `Delete "${saved?.name || "this session"}" from this device? This removes its saved notes and recording.`,
      )
    )
      return;
    try {
      if (sessionId === id) {
        clearTimeout(saveTimer.current);
        writeVersion.current++;
      }
      await deleteStudioSession(id);
      if (sessionId === id) {
        setSessionId(null);
        setSaveStatus("Not saved");
        try {
          localStorage.removeItem("cadence-studio-last");
        } catch {}
      }
      refreshLibrary();
    } catch (e) {
      showError(e);
    }
  }
  function setData(data, name, blob, baseBpm = 100) {
    validateNotes(data.notes);
    generation.current++;
    writeVersion.current++;
    stop();
    setResult(data);
    setHistory(historyStart(data.notes));
    setTitle(name.slice(0, 120));
    setOriginal(blob || null);
    setSessionId(null);
    setSaveStatus("Not saved");
    setSelected(null);
    setDraft(null);
    setError("");
    setSource("notes");
    setPrefs({
      ...defaults,
      baseBpm,
      bpm: baseBpm,
      end: Math.min(
        60,
        Math.max(...data.notes.map((n) => n.start + n.duration)),
      ),
    });
  }
  async function sample() {
    const token = ++generation.current;
    setError("");
    try {
      const r = await fetch("/samples/chords.wav");
      if (!r.ok) throw Error();
      const blob = await r.blob();
      if (token === generation.current && mounted.current)
        setData(example, "Synthesized chord example", blob);
    } catch {
      if (token === generation.current) {
        setData(example, "Synthesized chord example", null);
        setError("Example notes loaded. Original audio could not be loaded.");
      }
    }
  }
  async function uploadFile(file, recordedBpm = 100) {
    if (!file) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const token = ++generation.current;
    stop();
    setBusy(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a recording smaller than 20 MB.");
      const body = new FormData();
      body.append("audio", file);
      const response = await fetch(
        (import.meta.env.VITE_API_URL || "") + "/api/transcribe",
        { method: "POST", body, signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(
          typeof data.detail === "string"
            ? data.detail
            : "Transcription failed. Try a clearer recording.",
        );
      if (
        mounted.current &&
        token === generation.current &&
        !controller.signal.aborted
      )
        setData(data, file.name, file, recordedBpm);
    } catch (e) {
      if (mounted.current && e.name !== "AbortError")
        setError(
          e instanceof TypeError
            ? "Start the Python backend to transcribe your recording."
            : e.message,
        );
    } finally {
      if (mounted.current && request.current === controller) setBusy(false);
    }
  }
  const upload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    uploadFile(file);
  };
  function edit(changed) {
    try {
      stop();
      setHistory((h) => historyEdit(h, changed));
      setError("");
    } catch (e) {
      showError(e);
    }
  }
  function choose(index) {
    setSelected(index);
    setDraft({ ...notes[index] });
    setError("");
  }
  function apply(e) {
    e.preventDefault();
    try {
      validateNotes([draft]);
      edit(notes.map((n, i) => (i === selected ? { ...draft } : n)));
    } catch (e) {
      showError(e);
    }
  }
  function undo() {
    stop();
    setHistory((h) => historyUndo(h));
    setSelected(null);
    setDraft(null);
  }
  function redo() {
    stop();
    setHistory((h) => historyRedo(h));
    setSelected(null);
    setDraft(null);
  }
  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([encodeTranscriptionMidi(notes)], { type: "audio/midi" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = (title.replace(/[^a-z0-9_-]/gi, "-") || "cadence") + ".mid";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      showError(e);
    }
  }
  function updatePrefs(change) {
    const next = { ...prefs, ...change };
    const tempoChange = Object.keys(change).every((key) =>
      ["bpm", "speed"].includes(key),
    );
    const player = audio.current;
    if (tempoChange && player?.state === "running" && player.tempo) {
      // Keep playing while a number field is temporarily empty during typing.
      if (
        Number.isInteger(next.bpm) &&
        next.bpm >= 40 &&
        next.bpm <= 240 &&
        next.speed >= 0.25 &&
        next.speed <= 2
      ) {
        const target = (next.bpm * next.speed) / next.baseBpm;
        const rate = player.tempo.original
          ? target
          : target / player.tempo.renderedSpeed;
        try {
          player.setRate(rate);
          setError("");
        } catch (error) {
          showError(error);
        }
      }
    } else stop();
    setPrefs(next);
  }
  const updateProgress = (time) =>
    setProgress((previous) => {
      const rounded = Math.floor(time * 10) / 10;
      return rounded === previous ? previous : rounded;
    });
  async function play() {
    stop();
    setError("");
    try {
      const range = prefs.loop
        ? { start: prefs.start, end: prefs.end }
        : {
            start: 0,
            end:
              source === "original" && result.duration
                ? result.duration
                : Math.max(0.01, ...notes.map((n) => n.start + n.duration)),
          };
      let player;
      const callbacks = {
        onEnded: () => {
          if (mounted.current) setPlaying(false);
        },
        onStop: () => {
          if (mounted.current) setPlaying(false);
        },
        onError: (e) => {
          if (mounted.current) {
            setPlaying(false);
            showError(e);
          }
        },
      };
      if (source === "original") {
        if (!original) throw Error("This session has no original recording.");
        player = createMediaPlayback(original, {
          ...callbacks,
          start: range.start,
          end: range.end,
          loop: prefs.loop,
          rate: (prefs.speed * prefs.bpm) / prefs.baseBpm,
          onTick: (time) => updateProgress(time),
        });
      } else {
        const prepared = practiceNotes(notes, { ...prefs, ...range });
        if (!prepared.notes.length)
          throw Error("No notes occur in this loop. Choose a different range.");
        player = createNotePlayback(prepared.notes, {
          ...callbacks,
          duration: prepared.duration,
          instrument: prefs.instrument,
          loop: prefs.loop,
          start: 0,
          loopStart: prepared.lead,
          end: prepared.duration,
          onTick: (t) =>
            updateProgress(
              Math.min(
                range.end,
                range.start +
                  Math.max(0, t - prepared.lead) * prepared.playbackSpeed,
              ),
            ),
        });
        // Count-in plays once; subsequent loops restart at the musical passage.
      }
      player.tempo = {
        original: source === "original",
        renderedSpeed: (prefs.speed * prefs.bpm) / prefs.baseBpm,
      };
      audio.current = player;
      await player.ready;
      if (
        audio.current === player &&
        mounted.current &&
        player.state !== "closed"
      )
        setPlaying(true);
    } catch (e) {
      if (mounted.current) {
        stop();
        showError(e);
      }
    }
  }
  async function metronome() {
    stop();
    setError("");
    try {
      const player = createNotePlayback(metronomeNotes(prefs.bpm), {
        duration: (16 * 60) / prefs.bpm,
        rate: prefs.speed,
        loop: true,
        onStop: () => setPlaying(false),
        onError: showError,
      });
      player.tempo = {
        original: false,
        renderedSpeed: prefs.bpm / prefs.baseBpm,
      };
      audio.current = player;
      await player.ready;
      if (player.state !== "closed") setPlaying(true);
    } catch (e) {
      showError(e);
    }
  }
  const duration = notes.length
      ? Math.max(...notes.map((n) => n.start + n.duration))
      : 0,
    low = notes.length ? Math.min(...notes.map((n) => n.pitch)) - 1 : 48,
    high = notes.length ? Math.max(...notes.map((n) => n.pitch)) + 1 : 72,
    plotHeight = Math.max(180, (high - low + 1) * 15);
  function pointerDown(e, index) {
    if (busy) return;
    choose(index);
    stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      index,
      x: e.clientX,
      y: e.clientY,
      note: { ...notes[index] },
      element: e.currentTarget,
      moved: false,
      secondsPerPixel:
        ((Math.max(duration, 0.1) / 845) * 900) /
        roll.current.getBoundingClientRect().width,
      semitonesPerPixel:
        (plotHeight + 22) / roll.current.getBoundingClientRect().height / 15,
    };
  }
  function pointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientX - d.x,
      vertical = e.clientY - d.y;
    if (Math.abs(delta) + Math.abs(vertical) < 4) return;
    d.moved = true;
    const moved = moveNote(
      d.note,
      delta * d.secondsPerPixel,
      -vertical * d.semitonesPerPixel,
    );
    setDraft(moved);
    d.preview = moved;
    d.element.setAttribute(
      "transform",
      `translate(${((moved.start - d.note.start) / Math.max(duration, 0.1)) * 845},${-(moved.pitch - d.note.pitch) * 15})`,
    );
  }
  function pointerEnd(e, cancel = false) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.element.removeAttribute("transform");
    if (d.moved && !cancel && d.preview) {
      edit(notes.map((n, i) => (i === d.index ? d.preview : n)));
      setDraft(d.preview);
    }
  }
  if (libraryMode)
    return (
      <section className="studio-library">
        <h2>Your practice shelf</h2>
        <p>
          Sessions, corrections, settings and recordings saved only in this
          browser. They do not sync between devices.
        </p>
        {libraryError && <p role="alert">{libraryError}</p>}
        {error && <p role="alert">{error}</p>}
        {!library.length ? (
          <div className="studio-empty">
            <FolderOpen size={40} />
            <h3>A place for your next take</h3>
            <p>
              Open a recording or the chord example, then choose Save session.
            </p>
            <button className="button primary" onClick={onOpenStudio}>
              Go to studio
            </button>
          </div>
        ) : (
          <ul className="session-list">
            {library.map((record) => (
              <li key={record.id}>
                <div>
                  <strong>{record.name}</strong>
                  <span>
                    {record.kind === "report"
                      ? "Practice report"
                      : `${record.notes.length} notes`}{" "}
                    · {new Date(record.updated).toLocaleString()} ·{" "}
                    {record.audio
                      ? record.kind === "report"
                        ? "Original take included"
                        : "Original audio included"
                      : record.kind === "report"
                        ? "Report data"
                        : "Notes only"}
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => openSession(record.id)}
                >
                  {record.kind === "report" ? "Open report" : "Open session"}
                </button>
                <button
                  className="text-button"
                  aria-label={`Delete session ${record.name}`}
                  onClick={() => removeSession(record.id)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  return (
    <section
      className="transcription studio-editor"
      aria-labelledby="transcription-title"
    >
      <div className="studio-intro">
        <div>
          <h2 id="transcription-title">Your playing, in focus.</h2>
          <p>
            Turn a piano take into notes. Listen closely, make corrections, and
            practice the parts that matter.
          </p>
        </div>
        <div className="studio-import">
          {!demoOnly && (
            <label className="button primary transcription-upload">
              <Upload size={16} />
              {busy ? "Transcribing…" : "Upload piano recording"}
              <input
                type="file"
                aria-label="Upload piano recording"
                accept=".wav,.flac,.ogg"
                onChange={upload}
                disabled={busy}
              />
            </label>
          )}
          <button className="button secondary" onClick={sample} disabled={busy}>
            Try chord example
          </button>
        </div>
      </div>
      {demoOnly ? (
        <p className="studio-disclosure">
          Explore a real AI transcription of synthesized piano. New uploads and
          microphone transcription need the full app.
        </p>
      ) : (
        <>
          <p className="studio-disclosure">
            WAV, FLAC or OGG · up to 60 seconds / 20 MB. Audio is processed
            locally.
          </p>
          <StudioRecorder
            active={active}
            bpm={prefs.bpm}
            countIn={prefs.countIn}
            onRecorded={uploadFile}
            disabled={busy}
          />
        </>
      )}
      {!result && !demoOnly && (
        <div className="studio-practice-controls studio-first-take">
          <label>
            Tempo
            <input
              aria-label="Practice tempo"
              type="number"
              min="40"
              max="240"
              value={prefs.bpm}
              onChange={(e) => updatePrefs({ bpm: Number(e.target.value) })}
            />
            BPM
          </label>
          <label>
            Count-in
            <select
              aria-label="Count-in beats"
              value={prefs.countIn}
              onChange={(e) => updatePrefs({ countIn: Number(e.target.value) })}
            >
              <option value="0">None</option>
              <option value="4">4 beats</option>
            </select>
          </label>
          <button className="text-button" onClick={playing ? stop : metronome}>
            {playing ? "Stop metronome" : "Metronome only"}
          </button>
        </div>
      )}
      {busy && (
        <div className="studio-progress" role="status">
          Listening for notes and chords…
          <button
            className="text-button"
            onClick={() => {
              request.current?.abort();
              setBusy(false);
              setError(
                "Cancelled. The server may finish its current analysis before accepting another.",
              );
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="transcription-error" role="alert">
          {error}
        </p>
      )}
      {!result ? (
        <div className="studio-empty">
          <Music2 size={42} />
          <h3>Start with a little piano.</h3>
          <p>
            Bring a short recording, or open the chord example to explore the
            editor. Every note is yours to adjust.
          </p>
          <div className="empty-keys" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className={
                  [1, 2, 4, 5, 6, 8, 9, 11, 12, 13].includes(i)
                    ? "black-key"
                    : ""
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="studio-document">
            <div>
              <label className="session-name">
                Session name
                <input
                  aria-label="Session name"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <span className="transcription-result">
                {notes.length} estimated notes · {duration.toFixed(1)} seconds ·{" "}
                {saveStatus}
              </span>
            </div>
            <div className="studio-document-actions">
              <button
                className="button secondary"
                onClick={save}
                disabled={busy}
              >
                <Save size={15} />
                Save session
              </button>
              <button
                className="button primary"
                onClick={download}
                disabled={(!notes.length && source === "notes") || busy}
              >
                <Download size={15} />
                Export MIDI
              </button>
            </div>
          </div>
          <div className="studio-transport">
            <button
              className="button primary transport-play"
              onClick={playing ? stop : play}
              disabled={(!notes.length && source === "notes") || busy}
            >
              {playing ? <Square size={18} /> : <Play size={18} />}{" "}
              {playing
                ? "Stop notes"
                : source === "original"
                  ? "Play original"
                  : "Play detected notes"}
            </button>
            <div className="source-switch" aria-label="Playback source">
              <button
                className={source === "notes" ? "chosen" : ""}
                aria-pressed={source === "notes"}
                onClick={() => {
                  stop();
                  setSource("notes");
                }}
              >
                <Music2 size={15} />
                Detected notes
              </button>
              <button
                className={source === "original" ? "chosen" : ""}
                aria-pressed={source === "original"}
                disabled={!original}
                onClick={() => {
                  stop();
                  setSource("original");
                }}
              >
                <AudioLines size={15} />
                Original audio
              </button>
            </div>
            <span className="transport-time">
              {progress.toFixed(1)}s /{" "}
              {(source === "original" && result.duration
                ? result.duration
                : duration
              ).toFixed(1)}
              s
            </span>
            <label>
              Sound
              <select
                aria-label="Playback instrument"
                value={prefs.instrument}
                onChange={(e) => updatePrefs({ instrument: e.target.value })}
              >
                <option value="grand">
                  Grand piano
                  {pianoStatus === "loading"
                    ? " (loading…)"
                    : pianoStatus === "unavailable"
                      ? " (synth fallback)"
                      : ""}
                </option>
                <option value="synth">Soft synth</option>
              </select>
            </label>
            <label>
              Speed
              <select
                aria-label="Playback speed"
                value={prefs.speed}
                onChange={(e) => updatePrefs({ speed: Number(e.target.value) })}
              >
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => (
                  <option key={n} value={n}>
                    {n * 100}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="studio-practice-controls">
            <label className="check-control">
              <input
                type="checkbox"
                aria-label="Loop practice section"
                checked={prefs.loop}
                onChange={(e) => updatePrefs({ loop: e.target.checked })}
              />
              <Repeat2 size={15} />
              Loop section
            </label>
            <label>
              From
              <input
                aria-label="Loop start"
                type="number"
                min="0"
                max="60"
                step=".1"
                value={prefs.start}
                onChange={(e) => updatePrefs({ start: Number(e.target.value) })}
              />
            </label>
            <label>
              To
              <input
                aria-label="Loop end"
                type="number"
                min=".01"
                max="60"
                step=".1"
                value={prefs.end}
                onChange={(e) => updatePrefs({ end: Number(e.target.value) })}
              />
            </label>
            <label>
              Original tempo
              <input
                aria-label="Original tempo"
                type="number"
                min="40"
                max="240"
                value={prefs.baseBpm}
                onChange={(e) =>
                  updatePrefs({ baseBpm: Number(e.target.value) })
                }
              />
              <span>BPM</span>
            </label>
            <label>
              Tempo
              <input
                aria-label="Practice tempo"
                type="number"
                min="40"
                max="240"
                value={prefs.bpm}
                onChange={(e) => updatePrefs({ bpm: Number(e.target.value) })}
              />
              <span>BPM</span>
            </label>
            <label className="check-control">
              <input
                type="checkbox"
                aria-label="Metronome during playback"
                checked={prefs.metronome}
                onChange={(e) => updatePrefs({ metronome: e.target.checked })}
              />
              Metronome
            </label>
            <label>
              Count-in
              <select
                aria-label="Count-in beats"
                value={prefs.countIn}
                onChange={(e) =>
                  updatePrefs({ countIn: Number(e.target.value) })
                }
              >
                <option value="0">None</option>
                <option value="4">4 beats</option>
              </select>
            </label>
            <button
              className="text-button"
              onClick={playing ? stop : metronome}
            >
              {playing ? "Stop metronome" : "Metronome only"}
            </button>
          </div>
          <p className="transcription-limit">
            Original tempo is a timing guide, initially 100 BPM; set it to your
            recording’s tempo. Practice tempo and speed update playback
            immediately and change note timing together. Grand piano samples by{" "}
            <a href="https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html">
              Alexander Holm
            </a>{" "}
            (<a href="/licenses/Salamander-CC-BY-3.0.txt">CC BY 3.0</a>).
          </p>
          {prefs.loop && prefs.metronome && source === "notes" && (
            <p className="transcription-limit">
              The metronome completes the last beat before repeating the
              selected section.
            </p>
          )}
          {source === "original" && (
            <p className="transcription-limit">
              Original playback preserves pitch where supported. Metronome and
              count-in apply to detected notes and recording.
            </p>
          )}
          <div className="studio-edit-toolbar">
            <div role="tablist" aria-label="Note view">
              <button
                role="tab"
                aria-selected={view === "roll"}
                onClick={() => setView("roll")}
              >
                Piano roll
              </button>
              <button
                role="tab"
                aria-selected={view === "sheet"}
                onClick={() => setView("sheet")}
              >
                Sheet music
              </button>
            </div>
            <div>
              <button
                className="text-button"
                disabled={!history.past.length || busy}
                onClick={undo}
              >
                <Undo2 size={15} />
                Undo
              </button>
              <button
                className="text-button"
                disabled={!history.future.length || busy}
                onClick={redo}
              >
                <Redo2 size={15} />
                Redo
              </button>
              <button
                className="text-button"
                disabled={busy || notes.length >= 2000}
                onClick={() => {
                  const note = {
                    pitch: 60,
                    start: Math.min(duration, 59.5),
                    duration: 0.4,
                  };
                  edit([...notes, note]);
                  setSelected(notes.length);
                  setDraft(note);
                }}
              >
                Add missing note
              </button>
              <button
                className="text-button"
                onClick={() => {
                  edit(result.notes);
                  setSelected(null);
                  setDraft(null);
                }}
                disabled={busy}
              >
                <RotateCcw size={15} />
                Undo all edits
              </button>
            </div>
          </div>
          {view === "sheet" ? (
            <Suspense fallback={<p role="status">Preparing score…</p>}>
              <SheetMusic
                notes={notes}
                bpm={Math.max(
                  40,
                  Math.min(240, Math.round(prefs.baseBpm || 100)),
                )}
              />
            </Suspense>
          ) : (
            <>
              <div
                className="transcription-roll"
                aria-label="Detected notes piano roll"
              >
                <svg
                  ref={roll}
                  viewBox={`0 0 900 ${plotHeight + 22}`}
                  role="group"
                  aria-label="Notes arranged by pitch vertically and time horizontally"
                >
                  {Array.from({ length: high - low + 1 }, (_, i) => {
                    const pitch = high - i,
                      y = i * 15;
                    return (
                      <g key={pitch}>
                        <rect
                          className="pitch-row"
                          x="45"
                          y={y}
                          width="850"
                          height="15"
                        />
                        <text x="2" y={y + 12}>
                          {noteName(pitch)}
                        </text>
                        <line x1="45" x2="895" y1={y + 15} y2={y + 15} />
                      </g>
                    );
                  })}
                  {Array.from({ length: 7 }, (_, i) => (
                    <g key={`time-${i}`}>
                      <line
                        className="time-line"
                        x1={45 + (i / 6) * 845}
                        x2={45 + (i / 6) * 845}
                        y1="0"
                        y2={plotHeight}
                      />
                      <text x={45 + (i / 6) * 825} y={plotHeight + 16}>
                        {((duration * i) / 6).toFixed(1)}s
                      </text>
                    </g>
                  ))}
                  {prefs.loop &&
                    prefs.end > prefs.start &&
                    prefs.start < duration && (
                      <rect
                        className="loop-band"
                        x={45 + (prefs.start / Math.max(duration, 0.1)) * 845}
                        y="0"
                        width={
                          ((Math.min(prefs.end, duration) - prefs.start) /
                            Math.max(duration, 0.1)) *
                          845
                        }
                        height={plotHeight}
                      />
                    )}
                  {playing && (
                    <line
                      className="playhead-line"
                      x1={
                        45 +
                        (Math.min(duration, progress) /
                          Math.max(duration, 0.1)) *
                          845
                      }
                      x2={
                        45 +
                        (Math.min(duration, progress) /
                          Math.max(duration, 0.1)) *
                          845
                      }
                      y1="0"
                      y2={plotHeight}
                    />
                  )}
                  {notes.map((n, i) => (
                    <rect
                      key={i}
                      role="button"
                      tabIndex="0"
                      aria-label={`Edit note ${i + 1}: ${noteName(n.pitch)}, ${n.start.toFixed(2)} seconds`}
                      onPointerDown={(e) => pointerDown(e, i)}
                      onPointerMove={pointerMove}
                      onPointerUp={(e) => pointerEnd(e)}
                      onPointerCancel={(e) => pointerEnd(e, true)}
                      onClick={() => {
                        if (!drag.current) choose(i);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          choose(i);
                        }
                        if (e.key.startsWith("Arrow")) {
                          e.preventDefault();
                          const nudge = moveNote(
                            n,
                            e.key === "ArrowLeft"
                              ? -0.05
                              : e.key === "ArrowRight"
                                ? 0.05
                                : 0,
                            e.key === "ArrowUp"
                              ? 1
                              : e.key === "ArrowDown"
                                ? -1
                                : 0,
                          );
                          edit(
                            notes.map((note, index) =>
                              index === i ? nudge : note,
                            ),
                          );
                          setSelected(i);
                          setDraft(nudge);
                        }
                      }}
                      className={`note-block ${selected === i ? "selected" : ""}`}
                      x={45 + (n.start / Math.max(duration, 0.1)) * 845}
                      y={(high - n.pitch) * 15 + 2}
                      width={Math.max(
                        4,
                        (n.duration / Math.max(duration, 0.1)) * 845,
                      )}
                      height="11"
                    />
                  ))}
                </svg>
              </div>
              <p className="transcription-limit">
                Drag notes to change pitch and timing. Arrow keys move the
                focused note. Select a note for exact corrections; Undo and Redo
                keep your experiments reversible.
              </p>
            </>
          )}
          {draft && selected !== null && notes[selected] && (
            <form className="transcription-editor" onSubmit={apply}>
              <label>
                Pitch · {noteName(draft.pitch || 60)}
                <input
                  aria-label="Detected note pitch"
                  type="number"
                  min="21"
                  max="108"
                  step="1"
                  value={draft.pitch}
                  onChange={(e) =>
                    setDraft({ ...draft, pitch: Number(e.target.value) })
                  }
                  required
                />
              </label>
              <label>
                Start · seconds
                <input
                  aria-label="Detected note start"
                  type="number"
                  min="0"
                  max="60"
                  step="any"
                  value={draft.start}
                  onChange={(e) =>
                    setDraft({ ...draft, start: Number(e.target.value) })
                  }
                  required
                />
              </label>
              <label>
                Length · seconds
                <input
                  aria-label="Detected note length"
                  type="number"
                  min=".01"
                  max="60"
                  step="any"
                  value={draft.duration}
                  onChange={(e) =>
                    setDraft({ ...draft, duration: Number(e.target.value) })
                  }
                  required
                />
              </label>
              <button className="button secondary" type="submit">
                Apply correction
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  edit(notes.filter((_, i) => i !== selected));
                  setSelected(null);
                  setDraft(null);
                }}
              >
                <Trash2 size={15} />
                Delete note
              </button>
            </form>
          )}
          <div className="studio-footnote">
            <span>{result.model}. AI estimates need review.</span>
            <span>
              Save sessions to keep notes and original audio on this device.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
