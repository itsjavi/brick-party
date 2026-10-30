---
id: DECISION-21
title: Fights draw on a canvas outside React, and live updates bypass React state
date: 2026-10-30
tasks: [TASK-47]
---

## Context

Doodle Smash's fight was React-rendered SVG: the whole arena re-rendered every animation frame, and every room update
(~15 a second during the fight) went through React state, re-rendering the room screen. Doodle Champions' replays
re-rendered about 30 times a second per ring. The user asked why the engine wasn't drawn on a canvas instead, for all
the fight games, since React updates are expensive in a live game.

## Decision

- Fight scenes (Doodle Smash's arena, Doodle Champions' rings) are drawn on a `<canvas>` by plain TypeScript renderer
  classes that own their `requestAnimationFrame` loop (`smash/renderer.ts`, `doodle/ringRenderer.ts`). Fighters are
  drawn by `doodle/canvasFighter.ts`: each drawing's strokes become cached `Path2D`s per part, posed with the same
  transform chain as the SVG `FighterFigure` (`doodle/affine.ts`).
- React only mounts the canvas and the HTML around it (scoreboards, health bars, commentary, the big words), which
  re-render when their rounded values change, at most about ten times a second.
- `MatchView.live` says when the running game is live. `useRoom` hands every view to subscribers of its `RoomFeed`
  (`feed` in `GameProps`) at once, but updates React's `view` for a live game only when something besides the game's
  moving parts changed, or else at most every 250 ms (`lib/live-view.ts`). Games that aren't live get every view as
  before.
- `FighterFigure` stays as SVG for cards, previews and the /dev viewer.

## Consequences

- A live screen must read the fight from `feed`, not from its `view` prop, which lags by up to 250 ms during a live
  game; anything a screen must not miss (like Doodle Smash's roster, sent only now and then) is taken from the feed.
- Text and effects on the canvas are drawn by hand: CSS classes and animations don't reach them.
- Canvas logic is tested through its pure parts (transforms, camera, moments, throttling); the drawing itself is only
  checked in a browser.
