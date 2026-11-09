import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
  StaveTie,
  StaveConnector,
} from "vexflow/bravura";
import { notationBars } from "./studio-core.js";
const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
export default function SheetMusic({ notes, bpm }) {
  const host = useRef(null),
    [page, setPage] = useState(0),
    [error, setError] = useState("");
  const bars = useMemo(() => notationBars(notes, bpm), [notes, bpm]);
  useEffect(() => setPage(0), [notes, bpm]);
  useEffect(() => {
    let cancelled = false;
    async function draw() {
      await document.fonts.ready;
      if (cancelled || !host.current) return;
      host.current.replaceChildren();
      setError("");
      try {
        const shown = bars.slice(page * 4, page * 4 + 4),
          width = shown.length * 310 + 20;
        const extraTop = Math.max(
          0,
          (Math.max(84, ...notes.map((n) => n.pitch)) - 84) * 3,
        );
        const extraBottom = Math.max(
          0,
          (40 - Math.min(40, ...notes.map((n) => n.pitch))) * 3,
        );
        const renderer = new Renderer(host.current, Renderer.Backends.SVG);
        renderer.resize(width, 330 + extraTop + extraBottom);
        const context = renderer.getContext();
        context.setFillStyle("#243535");
        context.setStrokeStyle("#243535");
        const previous = { treble: null, bass: null },
          ties = [];
        for (const [index, bar] of shown.entries()) {
          const x = index * 310 + 10,
            staves = [
              new Stave(x, 35 + extraTop, 310),
              new Stave(x, 170 + extraTop, 310),
            ];
          if (index === 0) {
            staves[0].addClef("treble").addTimeSignature("4/4");
            staves[1].addClef("bass").addTimeSignature("4/4");
          }
          staves.forEach((stave) => stave.setContext(context).draw());
          if (index === 0)
            new StaveConnector(staves[0], staves[1])
              .setType(StaveConnector.type.BRACE)
              .setContext(context)
              .draw();
          context.fillText(String(bar.number), x + 8, 25);
          const voices = bar.staves.map((staff, staffIndex) => {
            const tickables = staff.segments.map((segment) => {
              const duration = { 8: "w", 4: "h", 2: "q", 1: "8" }[
                segment.units
              ];
              const pitches = segment.pitches;
              const key = (pitch) =>
                `${names[pitch % 12]}/${Math.floor(pitch / 12) - 1}`;
              const note = new StaveNote({
                clef: staff.clef,
                keys: pitches.length
                  ? pitches.map(key)
                  : [staff.clef === "treble" ? "b/4" : "d/3"],
                duration: duration + (pitches.length ? "" : "r"),
              });
              pitches.forEach((pitch, i) => {
                if (names[pitch % 12].includes("#"))
                  note.addModifier(new Accidental("#"), i);
              });
              for (const pitch of segment.continuing) {
                const prev = previous[staff.clef];
                if (prev?.pitches.includes(pitch))
                  ties.push({
                    firstNote: prev.note,
                    lastNote: note,
                    firstIndexes: [prev.pitches.indexOf(pitch)],
                    lastIndexes: [pitches.indexOf(pitch)],
                  });
                else
                  ties.push({
                    lastNote: note,
                    lastIndexes: [pitches.indexOf(pitch)],
                  });
              }
              previous[staff.clef] = { note, pitches };
              return note;
            });
            return new Voice({ numBeats: 4, beatValue: 4 })
              .addTickables(tickables)
              .setStave(staves[staffIndex]);
          });
          const formatter = new Formatter();
          voices.forEach((voice) => formatter.joinVoices([voice]));
          formatter.format(voices, index === 0 ? 205 : 285);
          voices.forEach((voice, i) => voice.draw(context, staves[i]));
        }
        ties.forEach((tie) => new StaveTie(tie).setContext(context).draw());
      } catch (e) {
        setError(
          "This passage is too dense to engrave clearly. Use the piano roll or a shorter loop.",
        );
      }
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [bars, page]);
  return (
    <section className="sheet-view" aria-label="Sheet music view">
      <div className="sheet-toolbar">
        <p>4/4 assumed · {bpm} BPM · eighth-note grid · treble and bass</p>
        <div>
          <button
            className="button secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous bars
          </button>
          <span>
            Bars {page * 4 + 1}–{Math.min(bars.length, page * 4 + 4)} of{" "}
            {bars.length}
          </span>
          <button
            className="button secondary"
            disabled={(page + 1) * 4 >= bars.length}
            onClick={() => setPage(page + 1)}
          >
            Next bars
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="sheet-canvas" ref={host} />
      )}
      <p className="transcription-limit">
        Notation is a quantized practice view, not verified sheet music. Adjust
        the tempo and correct notes in the piano roll; ties connect sustained
        notes across subdivisions.
      </p>
    </section>
  );
}
