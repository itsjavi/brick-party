---
id: TASK-25
title: Skip Logic canvas: add a bucket fill tool
priority: medium
labels: [phase-1, skip-logic, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Players can fill an enclosed area with the current color in one tap instead of scribbling.

## Acceptance criteria

- [x] A bucket tool sits in the Skip Logic toolbar and fills the area under the tap with the current color
- [x] Filled drawings are stored and replayed in reveals and reports like other strokes
- [x] The `brick` CLI and `brick shapes` stay able to draw fills, and bots' drawings still render
- [x] Server-side limits on drawing size still hold

## Notes

Requested by the user after a playtest, to make drawing in Skip Logic easier.
Open question: fill the clicked region (true flood fill) or keep the existing scribble-style `fill` shapes, which the CLI already has. Pick one in the task before building.

The user chose a solid flood fill. apps/web/app/components/games/skip-logic/fill.ts rasters the drawing at 500 cells a
side, floods from the tap with every line as a wall, grows the area a cell, and traces it back to rings (holes
included) along cell-edge midpoints, simplified to one cell. Fills paint under all lines (DECISION-16). The CLI's
`fill rect|circle|ellipse|triangle|polygon` now draws the same solid fills instead of scribbles. In the browser, a
background fill around three filled shapes took 56 points; a triangle took 8. The server's stroke and point limits are
unchanged, and `packStrokes` simplifies fills ring by ring when a drawing is over them.
