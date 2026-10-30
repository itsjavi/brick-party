---
id: TASK-31
title: Catch Survey Says answers of the wrong type in the bot CLI
priority: medium
labels: [phase-1, playtest, cli]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A bot move that the game would ignore fails at `act` with a clear error, instead of being queued and silently dropped.

## Acceptance criteria

- [x] `act` rejects a Survey Says scale answer or prediction sent as a string, and a who/choice answer sent as a number, naming the expected type.
- [x] A test covers both cases.

## Notes

- In a local playtest, `"answer":"8"` on a scale question passed the action schema (a string or a number),
  `act` said the move was queued, and the engine's `isValid` dropped it. All three bots fell to the autopilot.
- The check belongs in `gameMessage` or next to it in `apps/cli/src/act.ts`, using the current question's kind.
- Done in `act.ts`: after the schema, `gameMessage` checks Survey Says moves against the current question's kind. A
  scale question needs numbers; a who or choice question needs a player (names still work) or an option key as a
  string. The error names the field, what it takes (with the names or keys to pick from) and what was sent. Tests in
  `act.test.ts` cover all three kinds.

