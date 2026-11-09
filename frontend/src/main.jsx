import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Piano,
  ArrowUpRight,
  Play,
  Upload,
  Mic,
  Cable,
  Check,
  Music2,
  Download,
  CircleHelp,
  Square,
  Table2,
  Moon,
  Sun,
  Trash2,
  Library,
  Headphones,
  AudioLines,
} from "lucide-react";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./style.css";
import "./studio-shell.css";
import demo from "./demo.json";
import Results from "./Results.jsx";
import ScoreFollowerPanel from "./ScoreFollower.jsx";
import Transcription from "./Transcription.jsx";
import { createNotePlayback, AUDIO_HELP } from "./audio-playback.js";
import { saveStudioSession } from "./session-store.js";
import {
  permissionRequest,
  startAudioRecording,
  startMidiCapture,
} from "./capture.js";

const DEMO_ONLY = import.meta.env.MODE === "demo";
const API = import.meta.env.VITE_API_URL || "";
const demoReference = demo.notes.map((n) => ({
  pitch: n.pitch,
  start: n.time,
  duration: 0.38,
}));
// Browser demo is a bundled, disclosed snapshot. Real uploads always use Python.
async function request(path, options) {
  let res;
  try {
    res = await fetch(API + path, options);
  } catch {
    throw Error(
      "The Python server could not be reached. Start it on port 8000 and try again.",
    );
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error(
      "The server did not return a report. Check that the Python server is running.",
    );
  }
  if (!res.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : "The input was rejected. Check the files and try a shorter passage.",
    );
  return data;
}

function App() {
  const [workspace, setWorkspace] = useState(() =>
    ["studio", "follow", "report", "library"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "studio",
  );
  useEffect(() => {
    history.replaceState(null, "", "#" + workspace);
  }, [workspace]);
  const [result, setResult] = useState(demo),
    [mode, setMode] = useState("midi"),
    [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState(null),
    [performance, setPerformance] = useState(null),
    [selected, setSelected] = useState(null),
    [recording, setRecording] = useState(false),
    [midiDevice, setMidiDevice] = useState(""),
    [captureCount, setCaptureCount] = useState(0),
    [playing, setPlaying] = useState(false),
    [info, setInfo] = useState(false),
    [connecting, setConnecting] = useState(false),
    [notice, setNotice] = useState(""),
    [theme, setTheme] = useState(
      () =>
        localStorage.getItem("cadence-theme") ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cadence-theme", theme);
  }, [theme]);
  const audioCtx = useRef(null),
    recorder = useRef(null),
    midiAccess = useRef(null),
    midiCapture = useRef(null),
    capturing = useRef(false),
    audioTimer = useRef(null),
    midiTimer = useRef(null),
    reportGeneration = useRef(0),
    savedReportId = useRef(null);
  useEffect(
    () => () => {
      recorder.current?.stop();
      midiCapture.current?.stop();
      if (audioCtx.current && audioCtx.current.state !== "closed")
        audioCtx.current.close();
      clearTimeout(audioTimer.current);
      clearTimeout(midiTimer.current);
    },
    [],
  );
  useEffect(() => {
    reportGeneration.current++;
    if (workspace !== "report") {
      void recorder.current?.stop();
      recorder.current = null;
      midiCapture.current?.stop();
      midiCapture.current = null;
      capturing.current = false;
      clearTimeout(audioTimer.current);
      clearTimeout(midiTimer.current);
      audioCtx.current?.close();
      setRecording(false);
      setPlaying(false);
      setConnecting(false);
    }
  }, [workspace]);
  useEffect(() => {
    savedReportId.current = null;
  }, [result]);
  async function saveReport() {
    try {
      const id = savedReportId.current || crypto.randomUUID();
      await saveStudioSession({
        version: 1,
        kind: "report",
        id,
        name: "Practice report · " + new Date().toLocaleDateString(),
        updated: Date.now(),
        notes: result.notes,
        report: result,
        audio: null,
      });
      savedReportId.current = id;
      setNotice(
        "Practice report saved on this device. Open it from Saved sessions.",
      );
    } catch {
      setNotice(
        "This browser could not save the report. Export report to keep a copy.",
      );
    }
  }
  async function runDemo() {
    if (DEMO_ONLY) {
      setResult(demo);
      setSelected(null);
      setNotice("");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setResult(await request("/api/demo"));
    } catch {
      setResult(demo);
      setNotice(
        "The Python server is offline. These are saved demo results generated by Python.",
      );
    } finally {
      setBusy(false);
      setSelected(null);
    }
  }
  async function analyzeUpload(e) {
    e.preventDefault();
    setError("");
    if (!reference || !performance) {
      setError("Choose a reference MIDI and a performance first.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const data = new FormData();
      data.append("reference", reference);
      data.append("performance", performance);
      setResult(await request("/api/analyze", { method: "POST", body: data }));
      setSelected(null);
    } catch (e) {
      setError(
        e.message.includes("fetch")
          ? "Backend is offline. Start the Python server to analyze files."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function stopAudio() {
    clearTimeout(audioTimer.current);
    const file = await recorder.current?.stop();
    recorder.current = null;
    if (file) setPerformance(file);
    setRecording(false);
  }
  async function recordAudio() {
    const token = reportGeneration.current;
    setError("");
    if (recording) {
      await stopAudio();
      return;
    }
    setConnecting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Microphone recording is unavailable. Use localhost or HTTPS, or upload a WAV file.",
        );
      const stream = await permissionRequest(
        navigator.mediaDevices.getUserMedia({ audio: true }),
        "Microphone permission is still pending. Allow it in your browser, then try again.",
        15000,
        (value) => value.getTracks().forEach((track) => track.stop()),
      );
      if (token !== reportGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const handle = await startAudioRecording(stream);
      if (token !== reportGeneration.current) {
        void handle.stop();
        return;
      }
      recorder.current = handle;
      setRecording(true);
      audioTimer.current = setTimeout(stopAudio, 119000);
    } catch (error) {
      setError(
        error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in browser settings or upload a WAV file."
          : error.message,
      );
    } finally {
      setConnecting(false);
    }
  }
  async function connectMidi() {
    const token = reportGeneration.current;
    setError("");
    setConnecting(true);
    setMidiDevice("");
    try {
      if (!navigator.requestMIDIAccess)
        throw Error(
          "This browser does not support MIDI. Use Chrome or Edge on localhost, or upload a MIDI file.",
        );
      const access = await permissionRequest(
        navigator.requestMIDIAccess(),
        "MIDI permission is still pending. Allow it in your browser, then reconnect.",
      );
      if (token !== reportGeneration.current) return;
      const devices = [...access.inputs.values()].filter(
        (device) => device.state !== "disconnected",
      );
      if (!devices.length)
        throw Error(
          "No MIDI keyboard was found. Connect it by USB and try again.",
        );
      midiAccess.current = access;
      setMidiDevice(devices.map((device) => device.name).join(", "));
    } catch (error) {
      setError(
        error.name === "NotAllowedError"
          ? "MIDI access was denied. Allow it in browser settings or upload a MIDI file."
          : error.message,
      );
    } finally {
      setConnecting(false);
    }
  }
  async function toggleMidi() {
    setError("");
    if (!capturing.current) {
      if (
        ![...midiAccess.current.inputs.values()].some(
          (device) => device.state !== "disconnected",
        )
      ) {
        setError("The keyboard disconnected. Reconnect it before recording.");
        return;
      }
      midiCapture.current = startMidiCapture(
        midiAccess.current,
        setCaptureCount,
      );
      setCaptureCount(0);
      capturing.current = true;
      setRecording(true);
      midiTimer.current = setTimeout(toggleMidi, 119000);
      return;
    }
    clearTimeout(midiTimer.current);
    capturing.current = false;
    setRecording(false);
    const notes = midiCapture.current.stop();
    midiCapture.current = null;
    if (!notes.length) {
      setError("No MIDI notes were recorded. Play a few notes and try again.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      let score;
      if (reference) {
        const form = new FormData();
        form.append("reference", reference);
        score = await request("/api/reference", { method: "POST", body: form });
      } else score = await request("/api/reference");
      setResult(
        await request("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference: score.notes,
            performance: notes,
            measures: score.measures,
            meter_assumed: score.meter_assumed,
          }),
        }),
      );
      setSelected(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function listen() {
    if (playing) {
      audioCtx.current?.close();
      setPlaying(false);
      return;
    }
    setNotice("");
    try {
      const player = createNotePlayback(result?.reference || demoReference, {
        onEnded: () => setPlaying(false),
        onStop: () => setPlaying(false),
        onError: () => {
          setPlaying(false);
          setNotice(AUDIO_HELP);
        },
      });
      audioCtx.current = player;
      await player.ready;
      if (audioCtx.current === player && player.state !== "closed")
        setPlaying(true);
    } catch (error) {
      setPlaying(false);
      setNotice(error.message || AUDIO_HELP);
    }
  }
  function exportReport() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "cadence-practice-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="shell studio-shell">
      <a className="skip-link" href="#practice">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Piano size={23} />
          </span>
          cadence<span className="brand-dot">.</span>
        </div>
        <nav className="studio-nav" aria-label="Workspace">
          {[
            ["studio", "Piano studio", Piano],
            ["follow", "Live following", Headphones],
            ["report", "Practice report", AudioLines],
            ["library", "Saved sessions", Library],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              className={`nav-item ${workspace === id ? "active" : ""}`}
              aria-current={workspace === id ? "page" : undefined}
              onClick={() => setWorkspace(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tiny-piano">
            {Array.from({ length: 14 }, (_, i) => (
              <i
                key={i}
                className={
                  [1, 2, 4, 5, 6, 8, 9, 11, 12, 13].includes(i)
                    ? "has-black"
                    : ""
                }
              />
            ))}
          </div>
          <p>MIDI and audio analysis</p>
          <button
            className="text-button"
            onClick={() => {
              setInfo(!info);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <CircleHelp size={15} /> How it works
          </button>
        </div>
      </aside>
      <main id="practice">
        <header>
          <div className="breadcrumb">
            <span>
              Cadence <span className="breadcrumb-divider">/</span>{" "}
              {workspace === "studio"
                ? "Your piano workspace"
                : workspace === "follow"
                  ? "Follow your playing"
                  : workspace === "library"
                    ? "Your saved work"
                    : "Practice insights"}
            </span>
          </div>
          <div className="header-actions">
            <button
              className="text-button"
              onClick={() => setInfo(!info)}
              aria-expanded={info}
            >
              <CircleHelp size={15} />
              How it works
            </button>
            <button
              className="button secondary"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <h1>
              {workspace === "studio"
                ? "Piano studio"
                : workspace === "follow"
                  ? "Stay with the score"
                  : workspace === "library"
                    ? "Saved sessions"
                    : "Practice report"}
            </h1>
            <p>
              {workspace === "studio"
                ? "Listen. Make it yours. Play it again."
                : workspace === "follow"
                  ? "A place in the music, one attack at a time."
                  : workspace === "library"
                    ? "Pick up where you left off."
                    : "Find the passages worth another take."}
            </p>
          </div>
          <div className="page-heading-actions" hidden={workspace !== "report"}>
            <button
              className="button secondary"
              disabled={!result}
              onClick={saveReport}
            >
              Save practice report
            </button>
            <button
              className="button secondary"
              disabled={!result}
              onClick={exportReport}
              hidden={workspace !== "report"}
            >
              <Download size={16} />
              Export report
            </button>
          </div>
        </div>
        {DEMO_ONLY && workspace === "report" && (
          <div className="notice" role="note">
            Sample report: a C major exercise with deliberate pitch and timing
            errors. Explore the notes, play the reference, or download the
            report.
          </div>
        )}
        <div hidden={workspace !== "studio" && workspace !== "library"}>
          <Transcription
            demoOnly={DEMO_ONLY}
            libraryMode={workspace === "library"}
            active={workspace === "studio" || workspace === "library"}
            onOpenStudio={() => setWorkspace("studio")}
            onOpenReport={(report) => {
              setResult(report);
              setTab("overview");
              setWorkspace("report");
            }}
          />
        </div>
        <div hidden={workspace !== "follow"}>
          <ScoreFollowerPanel
            demoOnly={DEMO_ONLY}
            active={workspace === "follow"}
          />
        </div>
        {info && (
          <div className="notice">
            {workspace === "report"
              ? "Practice reports compare your take with a reference. MIDI supports chords; this report audio tracker estimates one pitch at a time. Timing adjusts for start delay and overall tempo."
              : workspace === "follow"
                ? "Live MIDI follows chord attacks; the microphone follower estimates the top note. Your position is saved in this browser."
                : "The studio turns piano recordings into editable AI note estimates. Compare the original, loop a passage, and save your session on this device. Sheet music uses an assumed 4/4 meter and the tempo you choose."}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        <div hidden={workspace !== "report"}>
          {busy && (
            <div role="status" className="loading-state">
              <span className="spinner" />
              Analyzing the take. Audio may take a minute on the first run.
            </div>
          )}
          {result && (
            <section className="session-banner">
              <div className="session-art">
                <Music2 size={38} />
                <span>♪</span>
              </div>
              <div className="session-copy">
                <div className="session-label">
                  {result.source === "demo"
                    ? "Demo results"
                    : "Uploaded performance"}
                </div>
                <h2>
                  {result.source === "demo"
                    ? "C major exercise"
                    : "Performance results"}
                </h2>
                <p>
                  {result.reference_count} reference notes<span>·</span>
                  {result.source === "audio"
                    ? "Audio estimate"
                    : result.source === "demo"
                      ? "120 BPM reference"
                      : "MIDI events"}
                  <span>·</span>
                  {result.source === "demo"
                    ? "~16 seconds"
                    : "Tempo-normalized timing"}
                </p>
              </div>
              <button className="button dark" onClick={listen}>
                {playing ? <Square size={15} /> : <Play size={15} />}
                {playing ? "Stop playback" : "Play reference"}
              </button>
            </section>
          )}
          <div className="content-grid">
            <div className="analysis-column">
              {result ? (
                <>
                  <Results
                    result={result}
                    tab={tab}
                    setTab={setTab}
                    selected={selected}
                    setSelected={setSelected}
                  />
                  <button
                    className="text-button"
                    disabled={busy || recording || connecting}
                    onClick={() => {
                      setResult(null);
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={14} />
                    Clear results
                  </button>
                </>
              ) : (
                <section className="card empty-state">
                  <Music2 size={28} />
                  <h3>No results yet</h3>
                  <p>
                    Upload a reference MIDI and a take, or open the sample demo.
                  </p>
                  <button className="button primary" onClick={runDemo}>
                    Quick demo
                  </button>
                </section>
              )}
            </div>
            <aside className="upload-column">
              {DEMO_ONLY ? (
                <section className="card upload-card">
                  <div className="card-heading">
                    <div>
                      <h3>Try the report</h3>
                      <p>
                        Select a note to inspect its pitch and timing. Select a
                        bar to find the notes worth repeating.
                      </p>
                    </div>
                  </div>
                  <p className="audio-note">
                    This demo shows saved analysis. To compare your own MIDI or
                    audio recordings, run Cadence locally.
                  </p>
                  <a
                    className="button primary full"
                    href="https://github.com/ebilesh/cadence#run-real-analysis"
                  >
                    Analyze your own take
                  </a>
                  <a
                    className="text-button"
                    href="https://github.com/ebilesh/cadence/blob/main/docs/architecture.md"
                  >
                    Read the scoring method <ArrowUpRight size={16} />
                  </a>
                </section>
              ) : (
                <section className="card upload-card">
                  <div className="card-heading">
                    <div>
                      <h3>Analyze a take</h3>
                      <p>Choose files or record here.</p>
                    </div>
                    <span className="upload-icon">
                      <Upload size={18} />
                    </span>
                  </div>
                  <div className="input-switch">
                    {[
                      ["midi", Piano, "MIDI"],
                      ["audio", Mic, "Audio"],
                      ["live", Cable, "Keyboard"],
                    ].map(([key, Icon, label]) => (
                      <button
                        key={key}
                        disabled={recording || busy || connecting}
                        aria-pressed={mode === key}
                        className={mode === key ? "selected" : ""}
                        onClick={() => {
                          setMode(key);
                          setPerformance(null);
                          setError("");
                        }}
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    ))}
                  </div>
                  {mode === "live" ? (
                    <div className="live-panel">
                      <div className="connection-icon">
                        <Cable size={28} />
                      </div>
                      <h4>{midiDevice || "Connect your keyboard"}</h4>
                      <p>
                        Play the demo exercise, or select your own reference
                        MIDI below. Stop recording to analyze the captured
                        notes.
                      </p>
                      <label className="dropzone">
                        <Music2 size={18} />
                        <strong>
                          {reference?.name || "Optional reference MIDI"}
                        </strong>
                        <small>No file selected: use the demo</small>
                        <input
                          aria-label="Keyboard reference MIDI"
                          type="file"
                          accept=".mid,.midi"
                          disabled={recording || busy || connecting}
                          onChange={(e) => setReference(e.target.files[0])}
                        />
                      </label>
                      <button
                        className="button secondary full"
                        onClick={connectMidi}
                        disabled={recording || busy || connecting}
                      >
                        {connecting
                          ? "Waiting for MIDI permission..."
                          : "Connect MIDI keyboard"}
                      </button>
                      {midiDevice && (
                        <button
                          className="button primary full"
                          disabled={busy || connecting}
                          onClick={toggleMidi}
                        >
                          {recording ? (
                            <Square size={15} />
                          ) : (
                            <Play size={15} />
                          )}{" "}
                          {recording
                            ? `Stop & analyze (${captureCount} notes)`
                            : "Record a take"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={analyzeUpload}>
                      <label className="field-label">
                        01 <span>Reference score</span>
                        <small>MIDI</small>
                      </label>
                      <label className="dropzone">
                        <Music2 size={21} />
                        <strong>
                          {reference?.name || "Choose a reference MIDI"}
                        </strong>
                        <small>.mid or .midi</small>
                        <input
                          type="file"
                          aria-label="Reference MIDI"
                          disabled={busy || recording || connecting}
                          accept=".mid,.midi"
                          onChange={(e) => setReference(e.target.files[0])}
                        />
                      </label>
                      <label className="field-label">
                        02 <span>Your performance</span>
                        <small>{mode === "midi" ? "MIDI" : "AUDIO"}</small>
                      </label>
                      <label className="dropzone">
                        <Upload size={21} />
                        <strong>
                          {performance?.name ||
                            `Choose ${mode === "midi" ? "your MIDI take" : "an audio recording"}`}
                        </strong>
                        <small>
                          {mode === "midi"
                            ? ".mid or .midi"
                            : ".wav, .flac or .ogg"}{" "}
                          · max 20 MB
                        </small>
                        <input
                          type="file"
                          key={mode}
                          aria-label="Performance file"
                          disabled={busy || recording || connecting}
                          accept={
                            mode === "midi" ? ".mid,.midi" : ".wav,.flac,.ogg"
                          }
                          onChange={(e) => setPerformance(e.target.files[0])}
                        />
                      </label>
                      {mode === "audio" && (
                        <button
                          type="button"
                          disabled={busy || connecting}
                          className={
                            "record-button " + (recording ? "is-recording" : "")
                          }
                          onClick={recordAudio}
                        >
                          {recording ? <Square size={14} /> : <Mic size={14} />}{" "}
                          {recording
                            ? "Stop recording"
                            : connecting
                              ? "Waiting for microphone permission..."
                              : "Record microphone"}
                        </button>
                      )}
                      <button
                        className="button primary full"
                        disabled={busy || recording || connecting}
                        type="submit"
                      >
                        {busy ? "Analyzing..." : "Analyze performance"}
                        {!busy && <ArrowUpRight size={17} />}
                      </button>
                    </form>
                  )}
                  {error && (
                    <div role="alert" className="error">
                      {error}
                    </div>
                  )}
                  <div className="privacy-note">
                    <Check size={13} />
                    <span>Files are deleted after analysis.</span>
                  </div>
                  <div className="sample-downloads">
                    <span>SAMPLE FILES</span>
                    <a href="/samples/reference.mid" download>
                      Reference MIDI
                    </a>
                    <a href="/samples/performance.mid" download>
                      MIDI take
                    </a>
                    <a href="/samples/performance.wav" download>
                      Audio take
                    </a>
                  </div>
                  {mode === "audio" && (
                    <p className="audio-note">
                      Audio results are estimates. Use single-note passages in a
                      quiet room. Chords or pedal can confuse pitch tracking.
                      Maximum length: 2 minutes.
                    </p>
                  )}
                </section>
              )}
              <section className="demo-card">
                <h3>Quick demo</h3>
                <p>
                  A short C major exercise with timing and pitch errors. No
                  files needed.
                </p>
                <button
                  className="button primary full"
                  disabled={busy || recording || connecting}
                  onClick={runDemo}
                >
                  Quick demo <ArrowUpRight size={16} />
                </button>
              </section>
            </aside>
          </div>
        </div>
        <footer>
          <span>Cadence</span>
          <span>Your piano. Your pace.</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
