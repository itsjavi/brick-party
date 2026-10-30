---
id: DECISION-16
title: Skip Logic drawings store shapes and fills as stroke kinds, fills under lines
date: 2026-10-30
tasks: [TASK-25, TASK-26, TASK-27]
---

## Context

The drawing tools gained shapes (rectangle, ellipse, triangle), a bucket and a light gray pen. Drawings are stored as
strokes (`strokeSchema` in packages/game/src/games/skip-logic.ts) and replayed in reveals and by the CLI, so the format
had to grow without breaking drawings already stored. The user chose a solid flood fill over the scribbled fills the CLI
used to draw.

## Decision

- A stroke has an optional kind `k`. Left out, it's a freehand line as before. `shape` is an outline of even width.
  `fill` is a solid area: closed rings, each ending on its first point, drawn with the even-odd rule so inner rings cut
  holes.
- Every fill paints under every line, whatever order they were drawn in. The bucket floods the area under the tap on a
  raster of the drawing, with every line as a wall, and grows it by a cell so it tucks under those lines.
- `DRAW_COLORS` is append-only: strokes store a color's index, so a new color goes at the end and the toolbar orders
  swatches separately.
- The server's limits (400 strokes, 12,000 point values) cover fills and shapes too.

## Consequences

- A fill can never hide line work, but a fill can't cover a line either: to recolor a line, undo it.
- The bucket needs a canvas to raster on, so it only runs in the browser; the CLI draws fills from closed shapes.
- Renderers must handle all three kinds: `Drawing.stsx`, `DrawingCanvas.stsx` and `strokesToSvg` in apps/cli.
