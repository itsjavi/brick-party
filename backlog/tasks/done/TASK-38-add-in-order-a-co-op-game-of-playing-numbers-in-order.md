---
id: TASK-38
title: Add In Order, a co-op game of playing numbers in order
priority: low
labels: [phase-3, new-game]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A short co-op game where the whole team wins or loses together, as a calm break between the competitive games. Each
player holds secret numbers from 1 to 100, and the team must play them all in rising order without saying numbers out
loud.

## Acceptance criteria

- [x] Each player gets secret numbers, and the number of cards per player grows each level.
- [x] Players play cards with no turns. The server decides the order plays arrive in, and a card played too early
      costs the team a life.
- [x] The team has a shared pool of lives, and a game lasts under 5 minutes.
- [x] Everyone gets the same points for each level the team clears. Awards can still pick out who played too early.
- [x] A "How to play" screen, and tests for ordering, lives and levels.
- [x] The bot CLI plays the game: `todoFor`, `botLines` and `sharedLines` in `apps/cli/src/moves.ts` cover it, with
      an autopilot fallback move for a bot that runs out of time, and tests next to the existing ones.
- [x] The playtest `playtest-driver` agent knows how to play it in character (`.claude/agents/playtest-driver.md`), and
      a full `/playtest` match with bots gets through the game.
- [x] Bots play cards at believable times without a turn order: the autopilot times each play from the gap to the
      lowest card on the table, since the driver agent is too slow to react within seconds.

## Notes

- Timing matters but only on a scale of seconds, so differences in network delay barely affect it.
- If the team wants a real-time competitive game instead, Paint Grab is the alternative: paint as much of a shared
  canvas as you can in 60 seconds, with strokes sent in batches and areas counted on the server.

Done:

- Rules in `packages/game/src/games/in-order.ts`: three levels with 1, 2 and 3 cards each from one shuffled 1-100
  deck, three shared lives, a 5-second "focus" countdown before each level and a 60/75/90-second limit (running out
  costs a life and ends the level unscored). Playing a card while someone holds a lower one costs a life and throws
  the lower cards away, shown to everyone. Everyone scores the same: +100/+200/+300 per level cleared and +50 per
  life left. A view never includes another player's card values.
- Bots time their plays: they wait a beat plus time per number between the pile's top card and their card, with a
  little jitter, so they mostly play in order and sometimes slip. Todos can be `timed`, which makes "Test it" bots wait
  for that moment instead of playing within seconds.
- Awards: Jumped the Gun, Patience of a Saint. In the endless rotation.
- Verified: rule tests, a "Test it" room in the browser (bots played at believable moments, a mistake cost a life,
  a level cleared), and a `/playtest` match with three bots: no errors, plays felt human-timed.
