---
id: TASK-33
title: Give Bot or Not answers more time
priority: low
labels: [phase-1, playtest, pacing]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

People have time to write a Bot or Not answer they're happy with.

## Acceptance criteria

- [x] The Bot or Not answer phase lasts 90 seconds instead of 60, at the default `GAME_PACE`.
- [x] The "How to play" text and any tests that mention the old length match.

## Notes

- In a local playtest the human player ran out of time in the 60-second answer phase and sent two words.
- The user chose 90 seconds for every room. `GAME_PACE` stays a dev setting for slowing everything down.
- `ANSWER_SECONDS` is 90 in `bot-or-not.ts`. The "How to play" text never named the length and no test did; a new
  test in `games.test.ts` pins the 90 seconds, and a "Test it" room's answer timer starts at 90.
- The game's length estimate went from 9 to 10 minutes: up to three rounds each get up to 30 s more. Playlists use
  it to fill their target length; the tests still pass.

