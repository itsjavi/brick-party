---
id: TASK-20
title: Worst Feedback: mark the replacement card as new
priority: low
labels: [phase-1, worst-feedback, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

When a played card is replaced, the replacement is visibly marked as new so players see their hand changed.

## Acceptance criteria

- [x] The card drawn to replace a played card shows a "new" marker in the next round's hand
- [x] The marker clears once the round ends or the card is played

## Notes

Found in a playtest: a hand is 6 cards dealt once (HAND_SIZE in packages/game/src/games/worst-feedback.ts), and only the card you play is replaced, so 5 of 6 cards repeat every round, and writing your own answer replaces nothing.
Decision from the user: the smaller change, a "new" marker.

Done with TASK-19: `freshIn` maps a card id to the round its marker shows in: the next round for a card that replaced
a played one, the current round for a swapped-in card. The view marks hand cards `fresh`; the hand shows a "New" tag,
and the CLI's hand line shows "(new)". Checked in the browser: round 2 marked the replacement only.
