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

Cadence uses an Operate-mode piano studio: a focused editor, a unified transport,
and a session shelf. The user selected the green studio direction for the UI
overhaul. PRODUCT.md records the audience, product facts and constraints.

The first viewport should make the current take, playback source, save/export
actions, and editable notes understandable. Detailed reports and live following
live in separate workspaces. A note drag is a single reversible edit; the playhead
and loop range explain the relationship between the sound and the notes.

## Colors

Green identifies actions, selected navigation, and successful notes. Neutral surfaces and fine borders separate report regions. Amber, terracotta, muted brown, and lavender distinguish timing, wrong, extra, and uncertain notes. Preserve their textual labels and differing marker shapes.

**The Theme Pair Rule.** Use the existing dark surface, text, border, and green overrides together. Dark mode is selected through the root data-theme attribute; retain the existing status-specific overrides.

## Typography

Manrope gives headings and score values their compact weight. DM Sans carries controls, labels, and explanatory text. Both families are self-hosted from Fontsource so presentation does not depend on a font CDN. The headline reduces to 30px at the tablet breakpoint and 25px on small screens. Supporting report descriptions use the supporting role; individual dense chart labels remain smaller.

**The Readable Report Rule.** Keep explanations readable and direct. Use plain descriptions of measured pitch and timing, and retain uncertainty labels for audio estimates.

## Layout

The desktop shell has a 220px navigation rail and a flexible main workspace with
38px horizontal padding. A 78px icon rail replaces it below 1000px. Below 700px,
navigation becomes a sticky top bar and main padding is 16px. Every icon retains
an accessible name. Workspace hashes preserve the selected view on reload.

Piano studio presents the take name and save/export actions, followed by the
transport, source comparison, loop/tempo controls, and the roll/staff tabs. The
editor is the main surface; controls use flat separators rather than nested
cards. Original and detected playback share one player. A Saved sessions list
shows actual browser-local records, including saved practice reports.

The piano roll scrolls independently on phones. Dragging a note consumes pointer
movement while blank space allows scrolling. The grand staff is a white paper
surface in both themes, with horizontal scrolling for dense or wide notation.

## Elevation & Depth

Report cards, exercise panels, and the session banner are flat, separated by borders and tonal surfaces. The selected input-mode control retains a subtle shadow (0 1px 5px #00000008). Button hover uses a small upward movement with a 0.2s transition; reduced-motion settings disable animation and transitions.

## Shapes

Controls and bar tiles use the control radius; navigation, metrics, and cards use their respective radius tokens. Upload targets use dashed borders. Reference notes are outlined; played notes are filled; missed event markers are dashed. These chart distinctions carry information and must remain intact.

## Components

Primary buttons use the action color with white text. Secondary buttons use a white surface and fine border. Focus uses a visible 3px outline with a 3px offset. Disabled controls reduce opacity and retain their disabled behavior.

File selectors are labeled dashed upload targets backed by real file inputs. Input mode is a three-way segmented control with an explicit selected state. Active navigation uses a pale green surface in light mode and a darker green surface in dark mode.

The report workspace retains scores, timeline, piano overlay, bar heatmap, note table, and exercises. Selected notes and bars retain their focus/selection treatments. Decorative session art, demo waves, and numbered exercise ornaments are hidden by the scoped refinement.

## Do's and Don'ts

- Do preserve the existing green light and dark palettes.
- Do preserve chart interactions, legends, marker shapes, and uncertainty labels.
- Do use clear report copy and visible keyboard focus.
- Don't add decorative model-oriented imagery or unsupported claims about musical ability.
- Don't use color alone to communicate note errors.
