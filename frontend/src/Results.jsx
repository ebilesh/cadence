import React from "react";
import { ArrowUpRight, Check, Music2, RotateCcw, Sparkles } from "lucide-react";

const name = (pitch) =>
  ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][
    pitch % 12
  ] +
  (Math.floor(pitch / 12) - 1);
const offset = (value) =>
  value == null ? "-" : `${value > 0 ? "+" : ""}${value} ms`;

export default function Results({
  result,
  tab,
  setTab,
  selected,
  setSelected,
}) {
  const focus = result.notes[selected],
    estimated = result.source === "audio";
  const duration =
    Math.max(
      result.sections.at(-1)?.end || 1,
      ...result.extras.map((n) => n.time + n.duration),
      ...result.notes.map(
        (n) => (n.played_time || 0) + (n.played_duration || 0),
      ),
    ) + 0.25;
  const allPitches = result.notes
    .flatMap((n) => (n.played == null ? [n.pitch] : [n.pitch, n.played]))
    .concat(result.extras.map((n) => n.pitch));
  const low = Math.min(...allPitches) - 2,
    high = Math.max(...allPitches) + 2;
  const position = (time, pitch, length) => ({
    left: `${(Math.max(0, time) / duration) * 98}%`,
    top: `${((high - pitch) / (high - low)) * 85}%`,
    width: `${Math.max(0.7, (length / duration) * 98)}%`,
  });
  return (
    <>
      <div className="section-top">
        <div className="tabs">
          <button
            className={tab === "overview" ? "selected" : ""}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            className={tab === "details" ? "selected" : ""}
            onClick={() => setTab("details")}
          >
            Note table <span>{result.notes.length + result.extras.length}</span>
          </button>
        </div>
        <span className="session-status">
          <i />
          {result.source === "demo"
            ? "Demo results"
            : estimated
              ? "Audio estimates"
              : "MIDI results"}
        </span>
      </div>
      {result.warnings.map((warning, i) => (
        <div className="notice" key={i}>
          {warning}
        </div>
      ))}
      <div className="metrics">
        <div className="metric main-score">
          <span>
            {estimated ? "Estimated score" : "Practice score"}
            <Sparkles size={14} />
          </span>
          <div>
            {result.score ?? "-"}
            <small>/ 100</small>
          </div>
          <p>
            {result.score == null
              ? "Not scored: overlapping audio"
              : "55% pitch + 45% timing"}
          </p>
          <div className="meter">
            <i style={{ width: (result.score || 0) + "%" }} />
          </div>
        </div>
        <div className="metric">
          <span>Pitch score</span>
          <div>
            {result.pitch_score ?? "-"}
            <small>{result.pitch_score == null ? "" : "%"}</small>
          </div>
          <p>Wrong, missed, and extra notes</p>
          <span className="metric-foot">
            <Music2 size={13} />
            {result.performance_count} detected notes
            {estimated &&
              ` / ${Math.round(result.audio_confidence * 100)}% confidence`}
          </span>
        </div>
        <div className="metric">
          <span>Timing score</span>
          <div>
            {result.timing_score ?? "-"}
            <small>{result.timing_score == null ? "" : "%"}</small>
          </div>
          <p>Start offset and tempo removed</p>
          <span className="metric-foot">
            <RotateCcw size={13} />
            {result.tempo_ratio}× reference duration
          </span>
        </div>
      </div>
      <div className="count-strip" aria-label="Error counts">
        {[
          ["missed", "Missed"],
          ["extra", "Extra"],
          ["wrong", "Wrong pitch"],
          ["early", "Early"],
          ["late", "Late"],
          ["uncertain", "Uncertain"],
        ].map(([key, label]) => (
          <div key={key}>
            <strong>{result.counts[key]}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {estimated && (
        <p className="count-note">
          Counts are estimates before confidence weighting. One note can have a
          pitch error and a timing error.
        </p>
      )}
      {tab === "overview" ? (
        <>
          <section className="card timeline-card">
            <div className="card-heading">
              <div>
                <h3>Note timeline</h3>
                <p>
                  Click a note to see its pitch and timing. Extra notes are
                  marked with +.
                </p>
              </div>
              <span className="pill">
                {estimated ? "ESTIMATED" : "ALIGNED"}
              </span>
            </div>
            <div className="legend">
              {[
                ["good", "Matched"],
                ["late", "Early / late"],
                ["wrong", "Wrong pitch"],
                ["missed", "Missed"],
                ["extra", "Extra"],
                ["uncertain", "Low confidence"],
              ].map(([status, label]) => (
                <span key={status}>
                  <i className={status} />
                  {label}
                </span>
              ))}
            </div>
            <div className="event-timeline">
              {result.notes.map((n, i) => (
                <button
                  key={i}
                  aria-label={`Note ${i + 1}: ${name(n.pitch)}, ${n.status}`}
                  className={`event-marker ${n.status} ${selected === i ? "focused" : ""}`}
                  style={{ left: `${(n.time / duration) * 96}%` }}
                  onClick={() => setSelected(i)}
                  title={`Bar ${n.measure}: ${n.status}, ${offset(n.error_ms)}`}
                />
              ))}
              {result.extras.map((n, i) => (
                <span
                  key={i}
                  className="extra-marker"
                  style={{ left: `${(Math.max(0, n.time) / duration) * 96}%` }}
                  title={`Extra ${name(n.pitch)} at ${n.time.toFixed(2)}s`}
                >
                  +
                </span>
              ))}
            </div>
            <div className="timeline-footer">
              {focus ? (
                <span>
                  <b>
                    Bar {focus.measure}: {name(focus.pitch)} at{" "}
                    {focus.time.toFixed(2)}s
                  </b>{" "}
                  / {focus.status} / played{" "}
                  {focus.played == null ? "-" : name(focus.played)} /{" "}
                  {offset(focus.error_ms)}
                  {focus.confidence != null &&
                    estimated &&
                    ` / confidence ${Math.round(focus.confidence * 100)}%`}
                </span>
              ) : (
                <span>Select a note for details.</span>
              )}
            </div>
          </section>
          <section className="card piano-card">
            <div className="card-heading">
              <div>
                <h3>Reference and performance</h3>
                <p>
                  Outlines show the reference. Filled notes show the aligned
                  take.
                </p>
              </div>
            </div>
            <div className="legend">
              <span>
                <i className="reference-key" />
                Reference
              </span>
              <span>
                <i className="good" />
                Performance
              </span>
            </div>
            <div className="piano-roll">
              <div className="pitch-labels">
                {[high, Math.round((high + low) / 2), low].map((p) => (
                  <span key={p}>{name(p)}</span>
                ))}
              </div>
              <div className="roll-grid">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    className="grid-line"
                    key={i}
                    style={{ left: i * 25 + "%" }}
                  />
                ))}
                {result.notes.map((n, i) => (
                  <React.Fragment key={i}>
                    <button
                      className={`note reference-note ${selected === i ? "focused" : ""}`}
                      aria-label={`Reference note ${i + 1}: ${name(n.pitch)}`}
                      style={position(n.time, n.pitch, n.duration)}
                      onClick={() => setSelected(i)}
                    />
                    {n.played != null && (
                      <button
                        className={`note played-note ${n.status} ${selected === i ? "focused" : ""}`}
                        style={position(
                          n.played_time,
                          n.played,
                          n.played_duration,
                        )}
                        aria-label={`Played note ${i + 1}: ${name(n.played)}, ${offset(n.error_ms)}`}
                        onClick={() => setSelected(i)}
                      />
                    )}
                  </React.Fragment>
                ))}
                {result.extras.map((n, i) => (
                  <span
                    key={i}
                    className="note played-note extra"
                    style={position(n.time, n.pitch, n.duration)}
                    title={`Extra ${name(n.pitch)}`}
                  />
                ))}
                <div className="time-labels">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i}>{((duration * i) / 4).toFixed(1)}s</span>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section className="card phrase-card">
            <div className="card-heading">
              <div>
                <h3>Measure heatmap</h3>
                <p>
                  Bars come from the reference MIDI's tempo and time signature.
                </p>
              </div>
              <span className="subtle">
                {estimated ? "ESTIMATED ERRORS" : "ERRORS BY BAR"}
              </span>
            </div>
            <div className="phrases">
              {result.sections.map((bar) => (
                <button
                  key={bar.number}
                  disabled={bar.first_index == null}
                  className={`phrase ${bar.mistakes / Math.max(bar.total, 1) > 0.3 ? "warm" : bar.mistakes ? "mild" : "cool"}`}
                  onClick={() => {
                    setSelected(bar.first_index);
                    setTab("details");
                  }}
                >
                  <span>
                    {bar.label}
                    <ArrowUpRight size={14} />
                  </span>
                  <strong>
                    {!bar.total && !bar.extra ? (
                      "Rest"
                    ) : bar.mistakes ? (
                      `${bar.mistakes} flagged`
                    ) : (
                      <Check size={22} />
                    )}
                  </strong>
                  <small>
                    {bar.start.toFixed(1)}-{bar.end.toFixed(1)}s
                  </small>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="card detail-card">
          <div className="card-heading">
            <div>
              <h3>Note table</h3>
              <p>
                Offsets use aligned time. Low-confidence audio notes are labeled
                uncertain.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bar</th>
                  <th>Time</th>
                  <th>Reference</th>
                  <th>Played</th>
                  <th>Offset</th>
                  <th>Confidence</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.notes.map((n, i) => (
                  <tr key={i} className={selected === i ? "highlight" : ""}>
                    <td>{n.measure}</td>
                    <td>{n.time.toFixed(2)}s</td>
                    <td>{name(n.pitch)}</td>
                    <td>{n.played == null ? "-" : name(n.played)}</td>
                    <td>{offset(n.error_ms)}</td>
                    <td>
                      {n.confidence == null
                        ? "-"
                        : Math.round(n.confidence * 100) + "%"}
                    </td>
                    <td>
                      <span className={"status-tag " + n.status}>
                        {n.status}
                      </span>
                      {n.pitch_status === "wrong" &&
                        n.timing_status !== "good" && (
                          <small className="second-status">
                            {n.timing_status}
                          </small>
                        )}
                    </td>
                  </tr>
                ))}
                {result.extras.map((n, i) => (
                  <tr key={"extra" + i}>
                    <td>{n.measure}</td>
                    <td>{n.time.toFixed(2)}s</td>
                    <td>-</td>
                    <td>{name(n.pitch)}</td>
                    <td>-</td>
                    <td>{Math.round(n.confidence * 100)}%</td>
                    <td>
                      <span className="status-tag extra">extra</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="coach-card">
        <div className="coach-heading">
          <span className="sparkle-box">
            <Sparkles size={20} />
          </span>
          <div>
            <h3>What to practice</h3>
            <p>Suggestions based on the errors in each bar.</p>
          </div>
          <span className="feedback-label">{result.feedback_source}</span>
        </div>
        {result.recommender_notice && (
          <div role="status" className="notice">
            {result.recommender_notice}
          </div>
        )}
        <div className="recommendations">
          {result.recommendations.map((rec, i) => (
            <div key={i}>
              <span className="step-number">0{i + 1}</span>
              <h4>{rec.title}</h4>
              <p>{rec.body}</p>
              <p className="recommendation-reason">
                <b>Reason:</b> {rec.reason}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
