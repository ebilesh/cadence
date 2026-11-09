import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  Play,
  Square,
  Download,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { noteName } from "./follower.js";
import { encodeTranscriptionMidi, validateNotes } from "./transcription.js";
import example from "./transcription-demo.json";
import "./transcription.css";

export default function Transcription({ demoOnly = false }) {
  const [result, setResult] = useState(null),
    [notes, setNotes] = useState([]),
    [selected, setSelected] = useState(null),
    [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [title, setTitle] = useState("");
  const request = useRef(null),
    audio = useRef(null),
    timer = useRef(null),
    mounted = useRef(true);
  const stop = () => {
    clearTimeout(timer.current);
    if (audio.current && audio.current.state !== "closed")
      void audio.current.close();
    audio.current = null;
    setPlaying(false);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      clearTimeout(timer.current);
      if (audio.current && audio.current.state !== "closed")
        void audio.current.close();
    };
  }, []);
  function load(data, name) {
    validateNotes(data.notes);
    stop();
    setResult(data);
    setNotes(data.notes.map((n) => ({ ...n })));
    setSelected(null);
    setDraft(null);
    setTitle(name);
    setError("");
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
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
            : "Transcription failed. Check the server and try again.",
        );
      if (mounted.current && !controller.signal.aborted) load(data, file.name);
    } catch (e) {
      if (mounted.current && e.name !== "AbortError")
        setError(
          e instanceof TypeError
            ? "The transcription server is unavailable. Start the Python backend and try again."
            : e.message,
        );
    } finally {
      if (mounted.current && request.current === controller) setBusy(false);
    }
  }
  function choose(index) {
    setSelected(index);
    setDraft({ ...notes[index] });
    setError("");
  }
  function apply(event) {
    event.preventDefault();
    try {
      validateNotes([draft]);
      const changed = notes.map((n, i) => (i === selected ? { ...draft } : n));
      stop();
      setNotes(changed);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  function download() {
    try {
      const blob = new Blob([encodeTranscriptionMidi(notes)], {
          type: "audio/midi",
        }),
        url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cadence-transcription.mid";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  }
  async function play() {
    stop();
    setError("");
    let context;
    try {
      context = new AudioContext();
      audio.current = context;
      await context.resume();
      if (audio.current !== context || !mounted.current) return;
      const now = context.currentTime + 0.05;
      for (const note of notes) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
        const start = now + note.start,
          end = start + note.duration;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.025, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.03);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.04);
      }
      setPlaying(true);
      timer.current = setTimeout(
        stop,
        (Math.max(...notes.map((n) => n.start + n.duration)) + 0.2) * 1000,
      );
    } catch (e) {
      if (mounted.current) {
        stop();
        setError(
          "Playback could not start. Try again in a browser with audio support.",
        );
      }
    }
  }
  const duration = notes.length
    ? Math.max(...notes.map((n) => n.start + n.duration))
    : 0;
  const low = notes.length ? Math.min(...notes.map((n) => n.pitch)) - 1 : 48,
    high = notes.length ? Math.max(...notes.map((n) => n.pitch)) + 1 : 72;
  const plotHeight = Math.max(180, (high - low + 1) * 15);
  return (
    <section className="transcription" aria-labelledby="transcription-title">
      <div className="transcription-heading">
        <h2 id="transcription-title">Turn piano audio into notes</h2>
        <p>
          Upload a recording. AI estimates each note, including chords. Listen,
          correct mistakes, and export MIDI.
        </p>
      </div>
      <div className="transcription-actions">
        {!demoOnly && (
          <label className="button primary transcription-upload">
            <Upload size={15} />
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
        <button
          className="button secondary"
          onClick={() => load(example, "Synthesized chord example")}
          disabled={busy}
        >
          Try chord example
        </button>
        {busy && (
          <button
            className="button secondary"
            onClick={() => {
              request.current?.abort();
              setBusy(false);
              setError(
                "Request cancelled. The server may finish its current analysis before accepting another.",
              );
            }}
          >
            Cancel
          </button>
        )}
      </div>
      <p className="transcription-limit">
        {demoOnly
          ? "This public demo uses saved AI output. Run the full app locally to transcribe your own recordings."
          : "WAV, FLAC or OGG · 0.15–60 seconds · up to 20 MB · no reference file needed. Audio is processed by your local server and deleted afterward."}
      </p>
      {busy && (
        <p role="status">
          Detecting notes and chords. Keep this page open; the first run may
          take longer.
        </p>
      )}
      {error && (
        <p className="transcription-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="transcription-result">
            <strong>{title}</strong>
            <span>
              {notes.length} estimated notes · {duration.toFixed(1)} seconds
            </span>
          </div>
          <div className="transcription-actions">
            <button
              className="button secondary"
              onClick={playing ? stop : play}
              disabled={!notes.length || busy}
            >
              {playing ? <Square size={15} /> : <Play size={15} />}{" "}
              {playing ? "Stop notes" : "Play detected notes"}
            </button>
            <button
              className="button primary"
              onClick={download}
              disabled={!notes.length || busy}
            >
              <Download size={15} />
              Export MIDI
            </button>
            <button
              className="button secondary"
              disabled={busy || notes.length >= 2000}
              onClick={() => {
                stop();
                const note = {
                  pitch: 60,
                  start: Math.min(duration, 59.5),
                  duration: 0.4,
                };
                setNotes([...notes, note]);
                setSelected(notes.length);
                setDraft({ ...note });
                setError("");
              }}
            >
              Add missing note
            </button>
            <button
              className="text-button"
              onClick={() => {
                stop();
                setNotes(result.notes.map((n) => ({ ...n })));
                setSelected(null);
                setDraft(null);
                setError("");
              }}
              disabled={busy}
            >
              <RotateCcw size={15} />
              Undo all edits
            </button>
          </div>
          {!!notes.length && (
            <div
              className="transcription-roll"
              aria-label="Detected notes piano roll"
            >
              <svg
                viewBox={`0 0 900 ${plotHeight + 22}`}
                role="group"
                aria-label="Notes arranged by pitch vertically and time horizontally"
              >
                {Array.from({ length: high - low + 1 }, (_, i) => {
                  const pitch = high - i,
                    y = i * 15;
                  return (
                    <g key={pitch}>
                      <text x="2" y={y + 12}>
                        {noteName(pitch)}
                      </text>
                      <line x1="45" x2="895" y1={y + 15} y2={y + 15} />
                    </g>
                  );
                })}
                {Array.from({ length: 7 }, (_, index) => (
                  <text
                    key={`time-${index}`}
                    x={45 + (index / 6) * 825}
                    y={plotHeight + 16}
                  >
                    {((duration * index) / 6).toFixed(1)}s
                  </text>
                ))}
                {notes.map((note, i) => (
                  <rect
                    key={i}
                    role="button"
                    tabIndex="0"
                    aria-label={`Edit note ${i + 1}: ${noteName(note.pitch)}, ${note.start.toFixed(2)} seconds`}
                    onClick={() => choose(i)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        choose(i);
                      }
                    }}
                    className={selected === i ? "selected" : ""}
                    x={45 + (note.start / Math.max(duration, 0.1)) * 845}
                    y={(high - note.pitch) * 15 + 2}
                    width={Math.max(
                      4,
                      (note.duration / Math.max(duration, 0.1)) * 845,
                    )}
                    height="11"
                  />
                ))}
              </svg>
            </div>
          )}
          <p className="transcription-limit">
            Horizontal position is time; vertical position is pitch. Notes
            stacked above each other form a chord. Select a note to correct it.
          </p>
          {draft && selected !== null && (
            <form className="transcription-editor" onSubmit={apply}>
              <label>
                Pitch ({noteName(draft.pitch || 60)})
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
                Start (seconds)
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
                Length (seconds)
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
                className="button secondary"
                type="button"
                onClick={() => {
                  stop();
                  setNotes(notes.filter((_, i) => i !== selected));
                  setSelected(null);
                  setDraft(null);
                }}
              >
                <Trash2 size={15} />
                Delete note
              </button>
            </form>
          )}
          <p className="transcription-limit">
            {result.model}. Estimates are not guaranteed: pedal, noise, dense
            chords and other instruments can cause missed or extra notes.
            Playback uses a simple synthesized tone. Corrections stay in this
            tab; export MIDI before leaving.
          </p>
        </>
      )}
    </section>
  );
}
