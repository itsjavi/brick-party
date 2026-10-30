---
id: TASK-26
title: Skip Logic canvas: add ellipse, rectangle and triangle tools
priority: medium
labels: [phase-1, skip-logic, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Players can drop an ellipse, a rectangle or a triangle by dragging, instead of freehand only.

## Acceptance criteria

- [x] Toolbar has ellipse, rectangle and triangle tools; dragging sets the size
- [x] Shapes use the current color and thickness, and can be undone like strokes
- [x] Reveals and reports render them
- [x] `brick shapes` covers the same shapes (ellipse and rect exist; add a triangle helper)

## Notes

Requested by the user after a playtest, to make drawing in Skip Logic easier.

Shapes are strokes with `k: "shape"`, drawn as even-width outlines (DECISION-16); Shift keeps a rectangle or ellipse
square. The tools sit in a column beside the canvas, so the bottom toolbar stays one row and "Done drawing" stays on a
768-pixel-tall screen; below 640 pixels wide the column becomes a row. `brick shapes` has `triangle x1 y1 x2 y2 x3 y3`.
Tests: shapes.test.ts, simplify.test.ts, draw.test.ts. Checked in the browser with bots: dragged shapes, Undo, the
reveal and `brick look`.
