---
id: TASK-36
title: Add Brick Brawl, a simultaneous-turn arena battle
priority: medium
labels: [phase-3, new-game]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A battle game with no drawing and no words. Bricks fight on a shrinking grid arena. Each turn, everyone secretly picks
a move and an action at the same time, and the server resolves them all at once into an animated replay. It plays like
an action game but stays fair whatever each player's network delay, and it fits the engine's action-and-deadline model.

## Acceptance criteria

- [x] Each turn of 12 seconds, every player picks one move: step, dash, shove, block or stay (one choice instead of
      a move plus an action, which kept turns quick to read).
- [x] The server resolves all choices together, with clear rules for collisions and ties, and every client plays the
      same replay.
- [x] The arena shrinks every few turns, and bricks knocked off the edge are out. The last brick standing wins.
- [x] Knocked-out players stay involved: each turn they pick a tile to drop a falling brick on, and hits score them
      points.
- [x] Players' brick avatars, with their faces and shapes, appear in the arena.
- [x] Retro Report awards for the game, such as most shoves or first one out.
- [x] A "How to play" screen, and tests for turn resolution.
- [x] The bot CLI plays the game: `todoFor`, `botLines` and `sharedLines` in `apps/cli/src/moves.ts` cover it, with
      an autopilot fallback move for a bot that runs out of time, and tests next to the existing ones.
- [x] The playtest `playtest-driver` agent knows how to play it in character (`.claude/agents/playtest-driver.md`), and
      a full `/playtest` match with bots gets through the game.
- [x] Bots can pick moves within a turn's deadline even though the driver agent is slow: `state` describes the arena
      as text (positions, edges, who's next to whom), and the autopilot picks a sensible move when a bot runs late.

## Notes

- Simultaneous turns were chosen over real time because players' network delays differ widely, and the engine only
  moves forward on player actions and alarm ticks, with no continuous loop.

Done:

- Rules in `packages/game/src/games/brick-brawl.ts`, with `resolveTurn` as a pure function: steps and dashes land
  first (same-tile and swap moves bounce, a dash into a still brick rams it a tile), then all shoves at once (2 tiles,
  adding up, stopping at other bricks), then dropped bricks, then the edge crumbling every 3 turns down to 3x3. Two
  rounds; 7x7, 9x9 or 11x11 by player count. Points: +150 per knockout (to everyone who pushed), 300/150/75 for the
  top three places, +50 per dropped-brick hit. No content and no Claude calls.
- Awards: Last Brick Standing, Bulldozer, Gravity Tester, The Sky Is Falling. Added to the hour-long and endless
  playlists.
- Screen: click a glowing tile (step, dash, or shove a neighbor), buttons, or keys (arrows, Shift dash, Alt shove,
  Space block). Bricks slide during the 4-second replay and spin away when they fall; a feed says what happened.
- Bots: `brawlMove` in `bots.ts` tries every move and prefers knockouts, safety and blocking when a neighbor could
  shove it off. The CLI draws the arena as a letter map with a legend.
- Verified: rule tests, a test room in the browser (desktop and phone width), and a full `/playtest` match with
  three Claude-driven bots. Round 1 was played by the driver with no missed deadlines; in round 2 the driver hung on
  its own command, so the autopilot played the bots.
- To tune in a team playtest: rounds usually end around turn 7 when the arena gets small, and the last 3x3 can feel
  like a coin flip between shoving and standing still.
