import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  RotateCcw,
  Cable,
  Mic,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { permissionRequest } from "./capture.js";
import {
  DEMO_NOTES,
  ScoreFollower,
  noteName,
  restoreSession,
  saveSession,
} from "./follower.js";
import {
  connectMidiFollower,
  connectMicrophoneFollower,
} from "./follower-input.js";
import "./follower.css";
import { createNotePlayback } from "./audio-playback.js";

export default function ScoreFollowerPanel({ demoOnly = false }) {
  const [initial] = useState(() => {
    let recovered = null;
    try {
      recovered = restoreSession(localStorage);
    } catch {}
    return (
      recovered || {
        notes: DEMO_NOTES,
        name: "Eight-chord study",
        follower: new ScoreFollower(DEMO_NOTES),
      }
    );
  });
  const engine = useRef(initial.follower),
    notes = useRef(initial.notes),
    name = useRef(initial.name);
  const [state, setState] = useState(initial.follower.snapshot());
  const [mode, setMode] = useState("idle"),
    [message, setMessage] = useState(
      initial.follower.position >= 0
        ? "Position restored. Choose an input to continue."
        : "Choose a live input or replay the study.",
    );
  const [error, setError] = useState(""),
    [heard, setHeard] = useState([]),
    [uploading, setUploading] = useState(false);
  const transport = useRef(null),
    generation = useRef(0),
    alive = useRef(true),
    sound = useRef(null),
    request = useRef(null),
    panel = useRef(null);
  useEffect(() => {
    const current = panel.current?.querySelector("[aria-current=step]");
    const list = panel.current?.querySelector(".follower-score");
    if (current && list)
      list.scrollTo({
        left:
          list.scrollLeft +
          current.getBoundingClientRect().left -
          list.getBoundingClientRect().left -
          (list.clientWidth - current.clientWidth) / 2,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [state.position]);
  const persist = () => {
    try {
      saveSession(localStorage, notes.current, name.current, engine.current);
    } catch {
      setError(
        "Progress could not be saved in this browser. Keep this tab open or enable local storage.",
      );
    }
  };
  const stop = () => {
    generation.current++;
    transport.current?.stop();
    transport.current = null;
    if (sound.current && sound.current.state !== "closed")
      void sound.current.close();
    sound.current = null;
    setMode("idle");
  };
  useEffect(() => {
    alive.current = true;
    const suspend = () => {
      stop();
      persist();
    };
    window.addEventListener("pagehide", suspend);
    return () => {
      alive.current = false;
      generation.current++;
      transport.current?.stop();
      request.current?.abort();
      if (sound.current && sound.current.state !== "closed")
        void sound.current.close();
      window.removeEventListener("pagehide", suspend);
    };
  }, []);
  const observe = (pitches, input) => {
    setHeard(pitches);
    const previousPosition = engine.current.position;
    const next = engine.current.observe(pitches, input);
    setState({ ...next });
    persist();
    if (next.unmatchedStreak >= 3)
      setMessage(
        "These notes have not matched. Check the next notes, or use Previous/Next to find your place.",
      );
    else if (input !== "demo" && next.position > previousPosition)
      setMessage("Following your playing.");
    if (next.position === engine.current.groups.length - 1) {
      if (input === "demo") {
        generation.current++;
        transport.current?.stop();
        transport.current = null;
        setMode("idle");
        const context = sound.current;
        setTimeout(() => {
          if (sound.current === context) {
            if (context?.state !== "closed") void context?.close();
            sound.current = null;
          }
        }, 600);
      } else stop();
      setMessage("Study complete. Replay it or start again.");
    }
  };
  const reset = (useDemo = false) => {
    stop();
    setError("");
    setHeard([]);
    if (useDemo) {
      notes.current = DEMO_NOTES;
      name.current = "Eight-chord study";
    }
    engine.current = new ScoreFollower(notes.current);
    setState(engine.current.snapshot());
    persist();
    setMessage("Ready at the beginning. Choose an input to follow.");
  };
  const seek = (index) => {
    stop();
    setHeard([]);
    setError("");
    setState(engine.current.seek(index));
    persist();
    setMessage(
      `Ready to follow attack ${index + 1}. Counts start from this position.`,
    );
  };
  async function begin(input) {
    stop();
    setError("");
    setHeard([]);
    if (engine.current.position === engine.current.groups.length - 1) {
      engine.current = new ScoreFollower(notes.current);
      setState(engine.current.snapshot());
      persist();
    }
    const token = generation.current;
    setMode("connecting");
    setMessage("Connecting…");
    const current = () => alive.current && generation.current === token;
    try {
      let session;
      if (input === "midi") {
        if (!navigator.requestMIDIAccess)
          throw Error(
            "Web MIDI is unavailable. Use Chrome or Edge on localhost or HTTPS, or replay the demo.",
          );
        const access = await permissionRequest(
          navigator.requestMIDIAccess(),
          "MIDI permission timed out. Allow access and reconnect.",
        );
        if (!current()) return;
        session = connectMidiFollower(
          access,
          (p) => observe(p, "midi"),
          (m) => {
            if (current()) setMessage(m);
          },
        );
      } else if (input === "microphone") {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error(
            "Microphone access requires localhost or HTTPS and a supported browser.",
          );
        session = await connectMicrophoneFollower(
          (p) => {
            if (current()) observe(p, "microphone");
          },
          (m) => {
            if (current()) setMessage(m);
          },
          undefined,
          (message) => {
            if (current()) {
              stop();
              persist();
              setMessage(message);
            }
          },
        );
      } else {
        const groups = engine.current.groups,
          first = engine.current.position + 1,
          base = groups[first].start;
        let index = first,
          tick = () => {};
        const player = createNotePlayback(
          groups
            .slice(first)
            .flatMap((group) =>
              group.pitches.map((pitch) => ({
                pitch,
                start: 0.25 + group.start - base,
                duration: 0.55,
              })),
            ),
          {
            onEnded: () => tick(true),
            onStop: () => {
              if (current()) {
                stop();
                persist();
                setMessage("Playback paused. Your position is saved.");
              }
            },
            onError: (error) => {
              if (current()) {
                stop();
                setError(error.message);
              }
            },
          },
        );
        sound.current = player;
        await player.ready;
        if (!current()) {
          player.close();
          return;
        }
        tick = (finished = false) => {
          while (
            current() &&
            index < groups.length &&
            (finished ||
              player.element.currentTime >= 0.25 + groups[index].start - base)
          ) {
            observe(groups[index++].pitches, "demo");
          }
        };
        const timer = setInterval(() => tick(), 30);
        session = { stop: () => clearInterval(timer) };
        tick();
        setMessage("Playing the reference chords through the live follower.");
      }
      if (!current()) {
        session?.stop();
        return;
      }
      transport.current = session;
      setMode(input);
    } catch (e) {
      if (current()) {
        stop();
        setError(
          e.message ||
            "Input could not start. Check permissions and reconnect.",
        );
        setMessage("Choose an input to try again.");
      }
    }
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    stop();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setUploading(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a MIDI reference smaller than 20 MB.");
      const body = new FormData();
      body.append("reference", file);
      const response = await fetch(
        (import.meta.env.VITE_API_URL || "") + "/api/reference",
        { method: "POST", body, signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(
          typeof data.detail === "string"
            ? data.detail
            : "The reference could not be read. Choose a MIDI file.",
        );
      const follower = new ScoreFollower(data.notes);
      if (!alive.current || controller.signal.aborted) return;
      notes.current = data.notes;
      name.current = file.name.slice(0, 200);
      engine.current = follower;
      setState(follower.snapshot());
      setHeard([]);
      persist();
      setMessage("Reference loaded. Choose a live input or replay.");
    } catch (e) {
      if (alive.current && e.name !== "AbortError")
        setError(e.message + " Start the Python server if it is unavailable.");
    } finally {
      if (alive.current && request.current === controller) setUploading(false);
    }
  }
  const groups = engine.current.groups,
    completed = state.position === groups.length - 1,
    nextIndex = state.position + 1,
    activeIndex =
      state.matched === 0 && state.skipped === 0 ? state.start : state.position;
  return (
    <section
      ref={panel}
      className="score-follower"
      aria-labelledby="follower-title"
    >
      <div className="follower-heading">
        <div>
          <h2 id="follower-title">Score follower</h2>
          <p>
            Follow chord attacks as you play. Your position stays in this
            browser.
          </p>
        </div>
        <span className="follower-state">
          {mode === "idle"
            ? completed
              ? "Complete"
              : "Paused"
            : mode === "connecting"
              ? "Connecting"
              : mode === "demo"
                ? "Demo playing"
                : "Listening"}
        </span>
      </div>
      <div className="follower-reference">
        <strong>{name.current}</strong>
        <span>
          {groups.length} attacks · {state.matched} matched
        </span>
      </div>
      <ol className="follower-score" aria-label="Reference chord sequence">
        {groups.map((g, i) => (
          <li
            key={i}
            aria-current={i === activeIndex ? "step" : undefined}
            className={
              i === activeIndex
                ? "current"
                : i >= state.start && i < state.position
                  ? "past"
                  : ""
            }
          >
            <button
              onClick={() => seek(i)}
              aria-label={`Start at attack ${i + 1}: ${g.pitches.map(noteName).join(", ")}`}
              disabled={uploading}
            >
              <span className="attack-number">{i + 1}</span>
              <span>{g.pitches.map(noteName).join(" · ")}</span>
              <small>{g.start.toFixed(2)}s</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="follower-navigation" aria-label="Score position">
        <div>
          <strong>
            {completed
              ? "Score complete"
              : `Next: attack ${nextIndex + 1} of ${groups.length}`}
          </strong>
          {!completed && (
            <span>{groups[nextIndex].pitches.map(noteName).join(" · ")}</span>
          )}
        </div>
        <div className="follower-position-buttons">
          <button
            className="button secondary"
            onClick={() => seek(nextIndex - 1)}
            disabled={nextIndex === 0 || uploading}
          >
            <ChevronLeft size={15} />
            Previous attack
          </button>
          <button
            className="button secondary"
            onClick={() => seek(nextIndex + 1)}
            disabled={nextIndex >= groups.length - 1 || uploading}
          >
            Next attack
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="follower-controls">
        <button
          className="button primary"
          onClick={() => begin("demo")}
          disabled={mode !== "idle" || uploading}
        >
          <Play size={15} />
          Replay {state.position >= 0 && !completed ? "from here" : "study"}
        </button>
        <button
          className="button secondary"
          onClick={() => begin("midi")}
          disabled={mode !== "idle" || uploading}
        >
          <Cable size={15} />
          Follow MIDI
        </button>
        <button
          className="button secondary"
          onClick={() => begin("microphone")}
          disabled={mode !== "idle" || uploading}
        >
          <Mic size={15} />
          Follow microphone
        </button>
        <button
          className="button secondary"
          onClick={() => {
            stop();
            persist();
            setMessage("Paused. Your position is saved.");
          }}
          disabled={mode === "idle"}
        >
          <Square size={15} />
          Stop
        </button>
        <button
          className="button secondary"
          onClick={() => reset()}
          disabled={uploading}
        >
          <RotateCcw size={15} />
          Start again
        </button>
        {!demoOnly && (
          <label className="button secondary follower-upload">
            <Upload size={15} />
            {uploading ? "Loading reference…" : "Load reference MIDI"}
            <input
              aria-label="Load follower reference MIDI"
              type="file"
              accept=".mid,.midi"
              onChange={upload}
              disabled={uploading}
            />
          </label>
        )}
        <button
          className="text-button"
          onClick={() => reset(true)}
          disabled={uploading}
        >
          Use demo study
        </button>
      </div>
      <p role="status" className="follower-status">
        {message}
      </p>
      {error && (
        <p role="alert" className="follower-error">
          {error}
        </p>
      )}
      <div className="follower-detail">
        <span>
          Heard:{" "}
          {heard.length ? heard.map(noteName).join(" · ") : "Waiting for notes"}
        </span>
        <span>
          Matched {state.matched} · Skipped {state.skipped} · Unmatched inputs{" "}
          {state.rejected}
        </span>
      </div>
      <p className="follower-limit">
        MIDI follows chord pitch sets and tolerates a missing tone; attacks
        within 65 ms are grouped. Microphone estimates the top note only
        (C3–C6); play one note at a time and release between repeated notes. No
        audio is uploaded. Click an attack to choose where to resume.
      </p>
    </section>
  );
}
