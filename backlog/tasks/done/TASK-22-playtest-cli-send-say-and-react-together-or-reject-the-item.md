---
id: TASK-22
title: Playtest CLI: send say and react together or reject the item
priority: low
labels: [phase-1, playtest, tooling]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

An `act` item with both `say` and `react` no longer drops the reaction silently.

## Acceptance criteria

- [x] An item with several of action, draw, say, react sends both say and react, or fails with a clear error
- [x] The playtest skill says how to send a reaction alongside a chat line
- [x] A test in apps/cli covers the combined item

## Notes

Found in a playtest: `daemon.ts` handles an item as an if/else chain (action, draw, say, react, ready), so `{"say":..., "react":...}` sent only the chat. The user noticed the bots hardly ever reacted.
Done: the item parsing moved from daemon.ts to apps/cli/src/act.ts (`partsOf`), which turns one item into a message per
part: at most one game move (action, draw or ready) plus say and react, each with its own natural delay. Two game moves
in one item are rejected, and every part is checked before anything is sent. Tests in act.test.ts.
