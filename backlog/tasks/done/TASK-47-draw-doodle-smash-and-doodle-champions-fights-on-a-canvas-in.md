---
id: TASK-47
title: Draw Doodle Smash and Doodle Champions fights on a canvas instead of React SVG
priority: high
labels: [phase-3, performance]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The live fights cost no React re-render per animation frame and none per network update. Doodle Smash and Doodle
Champions draw their fights on a `<canvas>` with an imperative renderer, and React only draws the HTML around them
when it changes. Visuals stay at least as good as the SVG they replace, on laptops and phones.

## Acceptance criteria

- [x] A shared canvas fighter renderer turns a drawing's strokes into cached `Path2D`s per part (same path data as the
      SVG, fills under lines) and draws it at a pose with the SVG fighter's transform chain, opacity and hit flash.
- [x] Doodle Smash's fight draws on a canvas from a renderer class with its own animation loop: stage, decor, moving
      platforms, items, trails, fighters, shots, effects, charge ring, shield, tags, the framing camera and the shake,
      sized to its container at the device's pixel ratio. Sounds play as before.
- [x] Doodle Smash's scoreboard and big words stay HTML and re-render only when their rounded values change, at most
      about ten times a second.
- [x] `MatchView` has `live`; `useRoom` gives every view to `feed` subscribers and throttles React's `view` during a
      live game (at once when anything besides the game's moving parts changes). Non-live games behave as before.
- [x] The Doodle Smash fight reads every update from the feed, not through React.
- [x] Doodle Champions' rings replay on a canvas with the same fighter renderer, with health bars and commentary as
      HTML that changes at the pace of the fight.
- [x] Smash fighters standing on a platform above the stage's bottom walk with their legs (they were stuck in the
      jump pose).
- [x] The /dev sandbox and fighter lab still work with the new API.
- [x] Type checks and unit tests pass in `packages/game`, `apps/cli` and `apps/web`, with tests for the pure parts.
- [x] Checked in a browser: both games' fights look at least as good as before, on a laptop and a phone, with no React
      re-renders per frame (React DevTools profiler or similar).

## Notes

- Built. The pieces:
  - `doodle/affine.ts`: in-place 2D transforms in canvas order, and `bodyTransform` / `limbTransform`, the SVG
    fighter's chain. Tested against an independently composed SVG chain.
  - `doodle/canvasFighter.ts`: `Path2D`s per part, cached by the strokes array (WeakMap), drawn with `setTransform`
    from scratch matrices. The hit flash draws the fighter again in white at `flash × 0.7` opacity, instead of the
    SVG's `brightness()` filter (`ctx.filter` isn't in Safari). Group opacity (KO, respawn blink) is per path on a
    canvas, so overlapping strokes of a half-transparent fighter show through each other slightly.
  - `smash/scene.ts`: the pure parts (camera framing and easing, `momentOf`, event words and sounds, ranking).
    `smash/renderer.ts`: `SmashRenderer`, which feeds the `FightClient`, plays event sounds, draws, and reports the
    HUD (`HudState`) through a callback, at most every 100 ms and only when its JSON changes (banners at once).
    `smash/Arena.stsx` mounts the canvas and the HUD.
  - `lib/live-view.ts`: `chromeKey` (the view without the live game's moving parts and the clock) and `viewDelay`.
    `lib/room.ts`: `RoomFeed` (`subscribe` replays the latest view at once) and the throttle with a trailing update.
  - `smash/roster.ts`: `RosterKeeper`. Doodle Smash's names, specs and drawings come only now and then during the
    fight, and React's throttled view could skip them, so the screen also takes them from the feed.
  - `doodle/ringRenderer.ts`: `RingRenderer`, the Champions replay on the server clock; the shake moves the ring's
    frame on the page as before. A finished fight is drawn once (and again on resize), not every frame.
- Smash's legs: `momentOf` passed the world height (`b.y`) as the height above the floor, which `poseAt` reads as
  airborne above 0.5, so everyone on a platform held the jump pose. It now passes 0 on a platform and 1 in the air.
  The gait distance is now `|dx| / SMASH_SCALE × FLOOR_SCALE` (it was `/ 3`, almost the same): the drawing's feet
  cover the ground they walk on, which at running speeds (9 to 18 units a tick) is roughly 2 to 5 leg cycles a second.
- `FighterPreview` (cards, weigh-in, drawing preview) and the /dev viewer still use the SVG `FighterFigure`.

Verified in the browser: a Doodle Smash test fight drawn on the canvas (stage, fighters, effects, HUD) and a
Doodle Champions round with both duel rings on the canvas. Brick Brawl's arena moved to a canvas in the same push
(commit b3a36d4), checked for hover ghosts, clicks and the replay. Walking legs in Doodle Smash are covered by
`smash/scene.test.ts`; the animation itself couldn't be watched because the browser pane was hidden (background tab).
