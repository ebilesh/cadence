import React, { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { permissionRequest, startAudioRecording } from "./capture.js";
import { createNotePlayback } from "./audio-playback.js";
import { metronomeNotes } from "./studio-core.js";
export default function StudioRecorder({
  bpm,
  countIn,
  onRecorded,
  disabled,
  active = true,
}) {
  const [status, setStatus] = useState("idle"),
    [error, setError] = useState(""),
    stream = useRef(null),
    recorder = useRef(null),
    clicks = useRef(null),
    timer = useRef(null),
    generation = useRef(0);
  const release = () => {
    generation.current++;
    clearTimeout(timer.current);
    clicks.current?.close();
    void recorder.current?.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => release(), []);
  useEffect(() => {
    if (!active || disabled) {
      release();
      setStatus("idle");
    }
  }, [active, disabled]);
  async function enable() {
    const token = ++generation.current;
    setStatus("connecting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Recording needs HTTPS and microphone support.");
      const acquired = await permissionRequest(
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        }),
        "Microphone permission timed out.",
        15000,
        (late) => late.getTracks().forEach((t) => t.stop()),
      );
      if (token !== generation.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = acquired;
      acquired.getTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            if (token !== generation.current) return;
            release();
            setStatus("idle");
            setError("Microphone disconnected. Enable it again to record.");
          },
          { once: true },
        ),
      );
      setStatus("armed");
    } catch (e) {
      if (token === generation.current) {
        setError(e.message);
        setStatus("idle");
      }
    }
  }
  async function begin() {
    if (!Number.isInteger(bpm) || bpm < 40 || bpm > 240) {
      setError("Choose a tempo between 40 and 240 BPM.");
      return;
    }
    const token = generation.current;
    setError("");
    // Prepare/unlock the audio context in the user's tap. Ignore PCM until
    // the count-in ends, so iOS does not need a second gesture to record.
    const preparation = startAudioRecording(stream.current, { defer: true });
    const fail = (message) => {
      if (token === generation.current) {
        release();
        setStatus("idle");
        setError(message);
      }
    };
    preparation
      .then((handle) => {
        if (token !== generation.current) void handle.stop();
        else recorder.current = handle;
      })
      .catch(() =>
        fail("Recording could not start. Reconnect the microphone."),
      );
    const record = async () => {
      try {
        const handle = await preparation;
        if (token !== generation.current) {
          void handle.stop();
          return;
        }
        handle.start();
        setStatus("recording");
        timer.current = setTimeout(finish, 59000);
      } catch {
        fail("Recording could not start. Reconnect the microphone.");
      }
    };
    if (countIn) {
      setStatus("counting");
      try {
        clicks.current = createNotePlayback(metronomeNotes(bpm, 1), {
          duration: (4 * 60) / bpm,
          onEnded: record,
          onStop: () => fail("Count-in stopped. Record again when ready."),
          onError: (e) => fail(e.message),
        });
        clicks.current.ready.catch((e) => fail(e.message));
      } catch (e) {
        fail(e.message);
      }
    } else await record();
  }
  async function finish() {
    clearTimeout(timer.current);
    if (!recorder.current) return;
    setStatus("finishing");
    const token = generation.current;
    const file = await recorder.current.stop();
    if (token !== generation.current) return;
    recorder.current = null;
    release();
    setStatus("idle");
    if (file) onRecorded(file);
  }
  const cancel = () => {
    release();
    setStatus("idle");
  };
  return (
    <div className="studio-recorder">
      {status === "idle" ? (
        <button
          className="button secondary"
          onClick={enable}
          disabled={disabled}
        >
          <Mic size={15} />
          Enable microphone
        </button>
      ) : status === "armed" ? (
        <>
          <button
            className="button primary"
            onClick={begin}
            disabled={disabled}
          >
            Record take{countIn ? " with count-in" : ""}
          </button>
          <button className="text-button" onClick={cancel}>
            Disconnect
          </button>
        </>
      ) : status === "recording" ? (
        <button className="button primary" onClick={finish}>
          <Square size={15} />
          Stop & transcribe
        </button>
      ) : (
        <button className="button secondary" onClick={cancel}>
          Cancel{" "}
          {status === "counting"
            ? "count-in"
            : status === "connecting"
              ? "connection"
              : "recording"}
        </button>
      )}
      {status === "recording" && (
        <span role="status">Recording · stops after 59 seconds</span>
      )}
      {status === "counting" && (
        <span role="status">Four beats, then recording begins.</span>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
