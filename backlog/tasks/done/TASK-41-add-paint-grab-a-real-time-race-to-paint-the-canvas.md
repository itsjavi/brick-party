---
id: TASK-41
title: Add Paint Grab, a real-time race to paint the canvas
priority: medium
labels: [phase-3, new-game, drawing]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A short, frantic game with no words: for 60 seconds everyone paints a shared canvas in their own colour, painting over
each other. The most canvas at the end wins. It's the playlist's one real-time game.

## Acceptance criteria

- [x] The canvas is a grid of cells; dragging paints cells in your colour, over anyone else's. Closing a loop around
      an area fills it, using Skip Logic's bucket fill idea.
- [x] Strokes are sent in batches about 5 times a second, and the server keeps the grid and counts areas, so network
      delay only decides small ties.
- [x] A live bar shows everyone's share; the final reveal counts up and awards points by share.
- [x] Bots can play it: a todo and a sensible fallback move in `packages/game/src/bots.ts` (used by "Test it" rooms and
      the CLI autopilot), `state` lines in `apps/cli/src/moves.ts`, and play notes in
      `.claude/agents/playtest-driver.md`.
- [x] Plays to the end in a "Test it" room, pauses cleanly, and gets through a `/playtest` match with bots.
- [x] A "How to play" screen, awards, sounds and animation that make it feel like a game, and tests for the rules.

## Notes

- Keep the message rate inside the room's limits (8 a second per connection, DECISION-11) and the state small.
- Built (not yet checked in a browser or a `/playtest`): rules in `packages/game/src/games/paint-grab.ts`, screen in
  `apps/web/app/components/games/PaintGrab.stsx`, brush in `apps/web/app/components/games/paint/brush.ts`.
- The grid is 48x32, one character per cell in the view (a seat letter or `.`), so a view is about 2 KB. Two rounds
  of 45 seconds after a 3-2-1 countdown, an 8-second count-up reveal after each, then a results table.
- A batch is `{"type":"paint","strokes":[[cell,...],...]}`: at most 64 cells in 8 strokes, each stroke one side at a
  time. The server refuses a batch with a gap and paints the rest up to the brush's ink (36 cells a second, 48 on
  screen plus 16 slack for bunched batches, +3 to put the brush down somewhere new). That's the anti-cheat speed
  limit; strokes can start anywhere because people lift the pen.
- A loop fills the areas of other cells it cuts off from the canvas edge (the edge is no wall), counting only areas
  next to the batch's own cells, so an island someone painted inside your old loop stays until you paint next to it.
- Twist: one paint pot at a time (first after 6 seconds, the next 5 seconds after a grab); brushing within a cell of
  it splats a disc of about 37 cells.
- Points per round: +200 / +100 / +50 for the most canvas (ties share the higher place) and +3 per whole percent.
  Awards: Lasso Legend (`loopCells`), Wet Paint (`paintedOver`), Pot Luck (`paintPots`).
- `GameRoom` now coalesces view broadcasts to one per 125 ms while the room's moment (phase, game deadline, pause)
  stays the same; a new moment goes out at once, and saves and alarms are unchanged (`Throttle` in `limits.ts`).
- Bots: a `steady` todo (timed, a new hint per stroke, so neither `runBots` nor the CLI's autopilot waits on the
  situation changing, and the driver isn't woken per stroke). They paint square loops about 2.7 times a second and
  own 15-20% each by the end of a test-room round. `runBots` keeps only a steady bot's current plan entry. The CLI's
  autopilot now looks every 250 ms and stays quiet about steady moves.
- Open: in test rooms each bot stroke moves the room's alarm, so `setAlarm` is written several times a second while
  bots paint.

Verified: a "Test it" room in the browser (bots paint loops that fill, loop fills show "+N", the share bar
and standings update live, ink runs low on fast scribbles) and a `/playtest` match with three bots: no act errors and
no late moves. Paint Grab got its own icon (it shared Fake Artist's brush). To watch on the live site: in test rooms
every bot stroke moves the room's alarm, so a test game writes the alarm several times a second.
