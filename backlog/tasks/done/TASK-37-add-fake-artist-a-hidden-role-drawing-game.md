---
id: TASK-37
title: Add Fake Artist, a hidden-role drawing game
priority: medium
labels: [phase-3, new-game, drawing]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A hidden-role game about a picture rather than words. Everyone but one player sees a secret word. Players take turns
adding one stroke each to a shared drawing, then vote on who the fake is. A caught fake still wins by guessing the
word. It's short, gets people talking, and reuses the Skip Logic canvas.

## Acceptance criteria

- [x] There is always exactly one fake, whatever the room size. Every player except the fake sees the secret word. The fake sees only the category.
- [x] Players add one stroke each in turn, a single freehand line from pen down to pen up with no shapes or bucket, for two rounds, on a shared canvas in their own colour.
- [x] Everyone votes on who the fake is. A caught fake gets one guess at the word.
- [x] No player's view includes the word unless they should see it, and the fake isn't revealed before the vote.
- [x] A hand-written list of simple words that work for players from many countries, with Claude-generated words as
      optional extras.
- [x] A "How to play" screen, and tests for role assignment, voting and scoring.
- [x] The bot CLI plays the game: `todoFor`, `botLines` and `sharedLines` in `apps/cli/src/moves.ts` cover it, with
      an autopilot fallback move for a bot that runs out of time, and tests next to the existing ones.
- [x] The playtest `playtest-driver` agent knows how to play it in character (`.claude/agents/playtest-driver.md`), and
      a full `/playtest` match with bots gets through the game.
- [x] Bots can add a single stroke with the `brick shapes` language and `brick look` at the shared drawing before
      they vote. The fake bot gets only the category in `state`.

## Notes

- The only text is one secret word, so it adds very little reading or typing to a playlist.

Done:

- Rules in `packages/game/src/games/fake-artist.ts`: 2 rounds (a different fake each), every player draws twice per
  round (20-second turns, a missed turn is skipped), a 45-second vote that ends early once everyone has voted, and a
  30-second guess for a caught fake. Scoring mirrors Bot or Not: +150 per correct vote, +400 for an escape (a tie
  escapes too, as in DECISION-15), +250 for a caught fake who guesses the word. Guesses forgive case, "the", plurals
  and one typo in words of 5 letters or more (`guessesWord`).
- Players get fixed colors (`FAKE_ARTIST_COLORS`, no white) and a fixed pen size. A line is sent when the pen lifts;
  a line still being drawn at the deadline is sent then.
- 132 hand-written words in 11 plain categories (`packages/content/packs/fake-artist.json`); "spicy" words are the
  harder ones to draw. Claude can add words (`fake-artist` in `ai.ts`). Awards: Master Forger, Art Critic,
  Misunderstood Artist. Added to the hour-long and endless playlists.
- Bots: `fakeArtistTodo` in `bots.ts` (a random curve as the fallback line). The CLI turns one `draw` shape into a
  line, refuses drawings sent as actions with a pointer to the `draw` field, names each player's color in `state`,
  and `brick look` renders the shared drawing with a color key. `situationKey` now includes the turn, which fixed
  bots skipping their second turn.
- Verified: unit tests, a test room in the browser, and a full `/playtest` match with three Claude-driven bots and a
  person in the browser: no errors or missed deadlines, recognizable drawings (mushroom, scissors).
- To tune in a team playtest: in both playtest rounds the drawings were clear enough that the caught fake guessed the
  word. If that keeps happening, consider lowering the guess reward or a single lap for big rooms.
- A first playtest run broke when the dev server reloaded the room's code mid-match: the browser reconnected to the
  fresh room, but the CLI bots stayed connected to the old one. A dev-only issue, not a game bug.
