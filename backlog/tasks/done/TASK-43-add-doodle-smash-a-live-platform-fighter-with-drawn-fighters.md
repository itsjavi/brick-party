---
id: TASK-43
title: Add Doodle Smash, a live platform fighter with drawn fighters
priority: medium
labels: [phase-3, new-game, drawing]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A Smash Bros-style variant of Doodle Champions that players control live. Everyone draws a fighter the same way (body,
legs, arms, weapon), then all fighters brawl on a side-view stage at once: move and jump with the arrow keys, attack
with Space, shield with B or Shift. Hits raise your damage %, the higher it is the further you fly, and falling off the
stage costs one of your 3 lives. Doodle Champions stays as the watch-and-bet version.

## Acceptance criteria

- [x] Drawing reuses Doodle Champions' part layers, live preview and rig; the Weapon tab has a Blaster / Blade toggle.
      The drawing still sets the stats (weight, speed, jump, reach), as in DECISION-18.
- [x] Controls: arrows run, jump (double jump) and drop; Space attacks in the direction held; holding Space charges a
      gauge and releasing it lands a boosted attack; B or Shift shields. Phones get on-screen buttons.
- [x] Shields weaken with consecutive use: each block in quick succession lets more through, and they recover when not
      used.
- [x] Blasters fire projectiles in the facing direction; blades hit on contact, reach set by the drawing. No weapon
      means punches.
- [x] Damage % and knockback scaled by weight; ring-outs past the blast zones; 3 lives, respawn invincibility; last
      fighter standing or best score at the time limit wins. Points by placement and KOs.
- [x] The server runs the fight at fixed ticks and is the authority; players send key changes, not positions, within
      the room's message limits; your own fighter moves at once on your screen and others are smoothed.
- [x] Bots fight with simple live AI in "Test it" rooms and through the CLI autopilot; the playtest driver adds table
      talk.
- [x] Each fight picks a random stage from a predefined set (at least 4), each with platforms on several levels that
      fighters jump up to and drop down through.
- [x] Power-ups spawn during fights (for example a heal, a speed boost, a big-hit charge, a shield refill) and are
      grabbed by touching them.
- [x] Pause holds the fight; awards, sounds, hit effects and a "How to play" screen; tests for the rules.

## Notes

- Shield is B or Shift, not Cmd: Cmd with arrows or W triggers browser shortcuts (back, close tab).
- Design choices are recorded in the decision linked to this task.
- Built (uncommitted, awaiting review and a `/playtest`): rules in `packages/game/src/games/smash-sim.ts` (stages,
  physics, attacks, shields, power-ups, bot AI, view packing), the game in `doodle-smash.ts`, the key coalescer in
  `smash-input.ts`. `GameDefinition` gained `live(state)` and `botInput(state, playerId, now)`; `reduceMatch` takes a
  fast path for live ticks and moves that copies only the game state (the fight never copies the drawings), and falls
  back to the full path for deadlines, timeouts and the game ending. The room ticks from memory (`apps/party/src/live.ts`)
  only while a live game runs, the match isn't paused and someone is connected, and sends updates every 66 ms then.
- Views pack every body into a row of numbers (`packBody`) and give the viewer's own fighter in full; names and specs
  come every second during the fight, drawings in the countdown and every 20 s, and screens keep them by
  `drawingsVersion` (a placeholder brick until then). A 12-fighter update is about 2 KB of game view on top of the
  room's own (members) data.
- Measured: a tick with 12 bot fighters is about 0.006 ms of rules; through `reduceMatch` with 12 players mashing keys
  and 12 views per broadcast, about 0.07 ms per tick (live.test.ts prints it).
- Inputs go out on change, then at most every 130 ms (`SMASH_INPUT_GAP_MS`), leaving room in the 8/s bucket for chat;
  a test mashes keys for two minutes against the bucket with chat on top.
- Not verified in a browser yet: the drawing screen's Blade/Blaster switch, the fight's look and feel (prediction,
  smoothing, sounds, hit effects), the touch buttons, and bots through the CLI autopilot.

Verified: drawing with the Blade/Blaster toggle and fill colours, a live fight in a test room (random stage, power-ups, KOs, results), a `/playtest` match with CLI bots (no errors, no missed moves), and a reload mid-fight (the screen asks for the drawings). After user feedback: fighters drawn about 1.5x bigger (`SMASH_SCALE` 0.19), a camera that frames the fighters, a ranked HUD with damage %, lives and KOs, and lag fixes (memoized room chrome, drawings on request, saves every 10 s during a fight). Not checked: touch controls on a real phone.
