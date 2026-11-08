---
name: Cadence
description: Piano practice reports for comparing a take with a MIDI reference.
colors:
  green: "#207565"
  action: "#267861"
  action-hover: "#1b614c"
  background: "#f8f9fa"
  surface: "#fff"
  text: "#243535"
  muted: "#586c65"
  supporting-text: "#4f655b"
  border: "#e6ebea"
  focus: "#8ebdaf"
  dark-background: "#132019"
  dark-surface: "#1c2b22"
  dark-text: "#e2ece4"
  dark-muted: "#acbfae"
  dark-green: "#8fc9aa"
  dark-border: "#35483d"
  correct-note: "#65977e"
  timing-note: "#cca052"
  wrong-note: "#bd755f"
  uncertain-note: "#a89bbf"
  extra-note: "#9e805f"
typography:
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    letterSpacing: "-1.3px"
  body:
    fontFamily: '"DM Sans", sans-serif'
  title:
    fontSize: "13px"
    fontWeight: 700
  supporting:
    fontSize: "13px"
    lineHeight: 1.6
  score:
    fontFamily: "Manrope, sans-serif"
    fontSize: "35px"
    fontWeight: 700
    letterSpacing: "-1.5px"
  button:
    fontSize: "11px"
    fontWeight: 600
rounded:
  control: "7px"
  navigation: "8px"
  metric: "9px"
  card: "10px"
spacing:
  control-block: "12px"
  control-inline: "16px"
  metric: "18px"
  card-heading: "22px"
  columns: "25px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    typography: "{typography.button}"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  metric:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.metric}"
    padding: "18px"
---

# Design System: Cadence

## Overview

Cadence uses a compact, green piano practice report: clear scores, note graphics, bar summaries, and practical exercises. The interface supports comparison of pitch and timing; it does not present scores as a measure of musical expression. Product context comes from README.md.

This is a record of the incumbent interface in frontend/src/style.css, main.jsx, and Results.jsx, including the scoped readability refinements. No new visual identity or creative metaphor is established.

## Colors

Green identifies actions, selected navigation, and successful notes. Neutral surfaces and fine borders separate report regions. Amber, terracotta, muted brown, and lavender distinguish timing, wrong, extra, and uncertain notes. Preserve their textual labels and differing marker shapes.

**The Theme Pair Rule.** Use the existing dark surface, text, border, and green overrides together. Dark mode is selected through the root data-theme attribute; retain the existing status-specific overrides.

## Typography

Manrope gives headings and score values their compact weight. DM Sans carries controls, labels, and explanatory text. The headline reduces to 30px at the tablet breakpoint and 25px on small screens. Supporting report descriptions use the supporting role; individual dense chart labels remain smaller.

**The Readable Report Rule.** Keep explanations readable and direct. Use plain descriptions of measured pitch and timing, and retain uncertainty labels for audio estimates.

## Layout

The desktop shell uses a fixed 232px sidebar and a main area with 42px horizontal padding, capped at 1680px. The report and upload area form a flexible main column plus a 294px column, separated by the columns spacing token. Three score cards sit above the report charts.

At 960px the sidebar narrows to 74px, the upload column to 250px, and main padding to 23px. At 700px the sidebar disappears, main padding becomes 18px, and upload controls precede the report in a single column. Bar tiles use two columns on small screens. Preserve scrolling and interaction for the dense chart and table views.

## Elevation & Depth

Report cards, exercise panels, and the session banner are flat, separated by borders and tonal surfaces. The selected input-mode control retains a subtle shadow (0 1px 5px #00000008). Button hover uses a small upward movement with a 0.2s transition; reduced-motion settings disable animation and transitions.

## Shapes

Controls and bar tiles use the control radius; navigation, metrics, and cards use their respective radius tokens. Upload targets use dashed borders. Reference notes are outlined; played notes are filled; missed event markers are dashed. These chart distinctions carry information and must remain intact.

## Components

Primary buttons use the action color with white text. Secondary buttons use a white surface and fine border. Focus uses a visible 3px outline with a 3px offset. Disabled controls reduce opacity and retain their disabled behavior.

File selectors are labeled dashed upload targets backed by real file inputs. Input mode is a three-way segmented control with an explicit selected state. Active navigation uses a pale green surface in light mode and a darker green surface in dark mode.

Scores, timeline, piano overlay, bar heatmap, note table, and exercises remain the report's primary visual content. Selected notes and bars retain their focus/selection treatments. Decorative session art, demo waves, and numbered exercise ornaments are hidden by the scoped refinement.

## Do's and Don'ts

- Do preserve the existing green light and dark palettes.
- Do preserve chart interactions, legends, marker shapes, and uncertainty labels.
- Do use clear report copy and visible keyboard focus.
- Don't add decorative model-oriented imagery or unsupported claims about musical ability.
- Don't use color alone to communicate note errors.
