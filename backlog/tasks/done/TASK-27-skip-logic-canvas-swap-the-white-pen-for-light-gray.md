---
id: TASK-27
title: Skip Logic canvas: swap the white pen for light gray
priority: low
labels: [phase-1, skip-logic, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The lightest pen is a light gray, not white, so it shows on the canvas.

## Acceptance criteria

- [x] The `white` color in the drawing palette becomes light gray in the toolbar, canvas, reveals and reports
- [x] Old stored drawings that used white still render sensibly
- [x] `brick shapes` and the playtest skill match the new color name

## Notes

Requested by the user after a playtest, to make drawing in Skip Logic easier.
Interpretation to confirm with the user: the pen called `white` is the one being changed.

The user chose to keep white and add light gray beside it, so the first criterion became "light gray is in the toolbar,
canvas, reveals and CLI renders". Gray (`#cbd5e1`) went at the end of `DRAW_COLORS` (DECISION-16), so stored drawings
keep their colors, and the toolbar shows it between ink and white. `brick shapes` knows it as `gray`; the playtest skill
names no colors. Checked in the browser: a gray line shows on the canvas, in the reveal and in `brick look`.
