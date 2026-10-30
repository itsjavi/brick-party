---
id: TASK-39
title: Let a player test any game alone from the homepage
priority: medium
labels: [phase-2, ui, playtest]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Anyone can try one game on their own, without gathering other players. Each game card on the homepage gets a "Test it"
button next to "How to play". It opens a private room running just that game, with bots filling the other seats and
playing on their own, so a single person can see how a game works from start to finish.

## Acceptance criteria

- [x] Each game card in `GamesShowcase.stsx` has a "Test it" button next to "How to play".
- [x] "Test it" starts a private room with only that game in the playlist, and the player as host. It doesn't appear
      in the open-rooms list.
- [x] The room adds 3 bots, so there are 4 players, one more than any current game's `minPlayers`, and the bots play every phase by themselves on the
      server, with no CLI or Claude needed.
- [x] Bot moves come from one shared place, so the CLI autopilot and test rooms use the same fallback moves for each
      game.
- [x] The player can skip ahead through phases (the host skip already does this) and leave at any time.
- [x] Test games don't count towards scores, awards or the Hall of Fame, and don't produce a shareable report.
- [x] It's on the live site for everyone. Test rooms make no Claude calls, count towards the existing room rate limits,
      and are cleaned up like other rooms, so they stay within Cloudflare's free plan.
- [x] Works for all four current games, and tests cover the server-side bots playing a whole game.

## Notes

- Today bots only exist in the CLI (`apps/cli`), which runs locally and connects like a browser. The fallback moves in
  `apps/cli/src/moves.ts` (`FallbackMove`, `todoFor`) are the natural thing to move into `packages/game` so the
  Durable Object can run them too.
- Bot content is canned: answers from the hand-written packs, random votes, the stock doodles. That's enough to see
  how a game flows, not to judge its content.
- The user decided "Test it" is on the live site for everyone, not only in local development (see the decision linked
  to this task).
- Once this exists, every new game (TASK-35 to TASK-38) must work in "Test it" as well, through the same shared bot
  moves the "New games" rule in AGENTS.md already requires.

Done:

- Bot moves (`todoFor`, fallbacks) and the shape-drawing language moved to `packages/game` (`bots.ts`,
  `draw-shapes.ts`); fallbacks now return the game action itself, with player ids. The CLI imports them.
- `createTestMatch` seats Bolt, Pixel and Widget (`TEST_BOTS`). `runBots` in `match.ts` presses "Got it" for them at
  once and plays each move 1.5 to 6 seconds (times `pace`) after it's needed, capped by the CLI's autopilot time.
  Bots stop once no person is left, and their plans then drop out of `nextDeadline`, so the alarm can't spin.
- The room skips the lobby when its person joins, and "Play again" goes straight back into the game. Test rooms load
  pack content without touching D1, never call Claude, stay off the open-rooms list and aren't saved.
- `/test/:gameId` makes the room (form rate limit `test-room`, a fresh unclaimed code) and redirects; without a brick
  it goes through onboarding first.
- Verified in the browser on the local dev server: no-brick redirect, the room header, bots answering and voting in
  seconds in Worst Feedback, the report without a shareable link, and Play again. `test-room.test.ts` plays all four
  games to the report.
