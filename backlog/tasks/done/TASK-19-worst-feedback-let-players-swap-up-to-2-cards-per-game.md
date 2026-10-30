---
id: TASK-19
title: Worst Feedback: let players swap up to 2 cards per game
priority: medium
labels: [phase-1, worst-feedback, gameplay]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Players who dislike a card in their Worst Feedback hand can swap it for a fresh one, up to 2 times per game.

## Acceptance criteria

- [x] A player can discard a card from their hand during the answer phase and get a replacement from the deck
- [x] Each player has at most 2 swaps per game; the screen shows how many are left
- [x] Swaps are validated on the server, never trusted from the client, and don't consume the player's answer
- [x] The `brick` CLI bots can swap too (moves.ts), and tests cover the limit

## Notes

Found in a playtest: a hand is 6 cards dealt once (HAND_SIZE in packages/game/src/games/worst-feedback.ts), and only the card you play is replaced, so 5 of 6 cards repeat every round, and writing your own answer replaces nothing.
Decision from the user: 2 swaps per player per game.

Done: a `swap` action (packages/game/src/games/worst-feedback.ts) trades a card in hand for a fresh one in the same
slot, during the answer phase, before answering. `swapsLeft` per player starts at `WORST_FEEDBACK_SWAPS` (2) and is
checked on the server; the view sends each player their count. The hand screen has "Swap it (N left)" beside "Play this
card", and the rules card mentions swaps. Bots get the swap move in their TODO hint. Tests in games.test.ts and
moves.test.ts. Checked in the browser with bots: my swap and a bot's swap through `act` both worked.
