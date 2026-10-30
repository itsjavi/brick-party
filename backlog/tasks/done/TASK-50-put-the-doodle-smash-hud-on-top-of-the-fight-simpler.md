---
id: TASK-50
title: Put the Doodle Smash HUD on top of the fight, simpler
priority: high
labels: [phase-3, ui, doodle-smash]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The fight's HUD sits below the stage, so on a laptop you scroll to see it, and it shows too much. Put it inside the
game area, along the top, and keep only what you need at a glance.

## Acceptance criteria

- [x] The HUD overlays the top of the fight area: no scrolling needed to see it while fighting, at laptop and phone
      sizes.
- [x] Per fighter, only what matters: who (colour and name), damage %, and lives; the leader is obvious.
- [x] Your own charge and shield show near your fighter or in a compact strip, not as extra cards.
- [x] Readable in the middle of a fight: big numbers, clear colours, no clutter.

## Notes

- Done: a slim scoreboard rides the top of the fight canvas, one chip per fighter in seat order (colour,
  name, damage %, lives), a crown on the leader, and your own chip carries thin charge and shield bars. Knockout
  counts and place numbers were dropped. The fight area is capped to the window's height so nothing needs scrolling.
- Checked at laptop and phone width in the browser. On phones the chips wrap into two rows over the top of the stage.
- While on it: the user asked whether low framerate came from the server or the screen. A performance overlay
  (backquote key) showed the screen at 110-144 fps with ~2 ms of drawing and server updates steady at ~68 ms. The
  choppiness was your own predicted fighter and moving platforms being drawn at whole 50 ms ticks; both now glide
  between ticks.
