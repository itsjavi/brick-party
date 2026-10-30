---
id: TASK-23
title: Playtest log: fix 'results chain NaN/undefined' on Bot or Not reveals
priority: low
labels: [phase-1, playtest, bug]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The watch log prints real chain numbers on Bot or Not reveals.

## Acceptance criteria

- [x] The `[reveal]` line for Bot or Not shows the round and phase, not `results chain NaN/undefined`
- [x] The Skip Logic and other reveal lines are unchanged

## Notes

Found in a playtest: every Bot or Not reveal logged `[reveal] Bot or Not · results chain NaN/undefined`. The room state itself was fine; the log line takes Skip Logic's chain fields. Look in apps/cli/src/daemon.ts.
Fixed: `situationLine` in apps/cli/src/moves.ts only prints chain numbers when the reveal has a `chain` (Skip Logic); Bot
or Not reveals fall through to `round N/M`. Covered in moves.test.ts.
