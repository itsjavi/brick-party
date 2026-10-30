---
id: TASK-29
title: Playtest autopilot: play fallbacks again after Play again
priority: low
labels: [phase-1, playtest, tooling, bug]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The `brick` daemon's autopilot plays a fallback move for a bot that runs out of time in every match, not only the first
one after the daemon starts.

## Acceptance criteria

- [x] After the host presses Play again, bots that don't act still get fallback moves near each deadline
- [x] A test in apps/cli covers a repeated game

## Notes

Found while checking TASK-25: in the second Skip Logic match of one room, no bot drew and the reveal showed "ran out of
time" for all three. The autopilot remembers what it did in `#autoDone`, keyed on `situationKey` (apps/cli/src/moves.ts)
plus the hint, and a replayed game repeats the same keys (same match index, game, phase and step). Clearing the memory
when the room goes back to the lobby, or adding a per-match value to the key, would fix it. Restarting the daemon is
the workaround.

Done: the memory moved to `AutopilotMemory` (apps/cli/src/autopilot.ts), which forgets everything when any bot sees the
room in the lobby. The daemon feeds it on every state update rather than in the debounced situation check, so a lobby
that lasts under a second still counts. It covers the intro's "Got it" too, which had the same bug. Tests in
autopilot.test.ts. Live check: two matches in one room with 3 bots; in both, the bots pressed "Got it" on their own and
played fallback cards 6 seconds before the deadline.
