---
id: TASK-42
title: Add Hue Clue, a colour-guessing game with one-word clues
priority: medium
labels: [phase-3, new-game]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A colour game with almost no reading, like Hues and Cues: one player sees a secret colour on a big grid of hues and
gives a one- or two-word clue, everyone else taps the cell they think it is, and closer guesses score more.

## Acceptance criteria

- [x] A grid of about 16 by 10 hues; each round one clue-giver gets a random target cell.
- [x] The clue-giver types a short clue (a word or two, no colour names or numbers is a house rule shown on screen);
      everyone else taps a cell, and may change it until time runs out.
- [x] Points by distance from the target, plus points for the clue-giver for every guesser close by.
- [x] Every player gives clues once (or twice in small rooms).
- [x] Bots can play it: a todo and a sensible fallback move in `packages/game/src/bots.ts` (used by "Test it" rooms and
      the CLI autopilot), `state` lines in `apps/cli/src/moves.ts`, and play notes in
      `.claude/agents/playtest-driver.md`.
- [x] Plays to the end in a "Test it" room, pauses cleanly, and gets through a `/playtest` match with bots.
- [x] A "How to play" screen, awards, sounds and animation that make it feel like a game, and tests for the rules.

## Notes

- Board: 16 by 10 cells (columns A-P, rows 1-10), made in code in OKLCH (`packages/game/src/games/hue-grid.ts`), hue
  across from red to pink, pale to dark down; yellows stay light longer and blues darken sooner so every hue gets a
  vivid middle. The room, the screens and the CLI's `brick look` all use the same `HUE_COLORS`.
- Rounds: one clue (a word or two) per round, then one pin per guesser. The second, refined clue of the board game was
  left out to keep a 12-player room inside about 8 minutes. Clue 30 s, guess 25 s (ends early once everyone locks in),
  reveal 9 s. Everyone gives one clue, two in rooms of four or fewer.
- Pins stay hidden until the reveal (others only see who has a pin down, and who locked in), so nobody follows the
  crowd and the reveal is the moment.
- A clue-giver who runs out of time gets a house clue from the bots' word table and scores nothing for it; one who
  leaves before giving the clue takes the round with them.
- Scoring: +300 on the colour, +200 one ring off, +100 two rings off; the clue-giver +100 per pin within one ring and
  +50 per pin two rings off. Awards: Bullseye (`bullseyes`), Colour Whisperer (`clueHits`), Scenic Route (`wayOff`).
- Bots: `hue-words.ts` maps about 100 everyday things to colours; every cell has one within a ring. A bot clue-giver
  names a thing near its colour (with "dark"/"pale" when a couple of rows off); a bot guesser taps that thing's cell,
  give or take one, or a random cell for a clue it doesn't know. Bot-to-bot pins land within a ring about 85% of the
  time. Guesses take a label (`"F4"`) or an index.
- Verified by tests: rules, secrecy, scoring, clue checks, a full game, "Test it" room to the report, pause. Not yet
  verified: the screen in a browser and a `/playtest` match.

Verified: a "Test it" room in the browser (the board, the clue shown big, pin and lock-in, the reveal with
ring squares and points) and a `/playtest` match with three Claude-driven bots and a person. Fix from the playtest:
punctuation in a clue is dropped instead of refusing the clue ("honeydew melon!" was refused). To tune with the team:
red (A) and pink (P) sit at opposite ends, so a "cherry" clue can split guesses.
