---
id: TASK-56
title: Let the host add time to the current timer
priority: high
labels: [phase-3, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Pause stops the clock and holds every move, so it can't be used to give slow players more time. Keep pause as a full
stop, and give the host a "+N s" button next to it that adds the current screen's usual length to its timer.

## Acceptance criteria

- [x] The host sees "+N s" next to pause on the rules screen, timed game phases and the scoreboard between games, where
      N is that screen's usual length
- [x] Pressing it adds N seconds to everyone's timer and says so in chat; only the host can
- [x] Live game phases (fights, Paint Grab's round) have no "+N s": they run on their own clock
- [x] Every game records how long each phase was given, with a test that keeps future games doing it
- [x] Typecheck and tests pass; checked in a "Test it" room

## Notes

- Every game keeps its timer in `phaseEndsAt`, and its `deadline` follows it. `PhaseClock` in `engine.ts` names that
  contract and adds `phaseMs`, the length the phase was given, which each game's phase helper now records. The match
  (`extendMs` and the `extend` event in `match.ts`) moves the game's `phaseEndsAt` itself, so games need no
  `extend` handling of their own.
- New games must set `phaseMs` with `phaseEndsAt`; "the host's +N s button" test in `games.test.ts` fails otherwise.
  Make It Worse (TASK-44, on its own branch) needs this once it merges main.
- Extending moves the deadline forward and leaves the clock alone, so speed scores based on submit times aren't
  affected. Scores based on time left can grow a little.
- Checked in a "Test it" room for Worst Feedback Ever: the rules screen showed "+20s" and went from about 8 to 28 seconds;
  the answer phase showed "+75s" and went from 67 to 142, and chat said "Tester added 75 seconds."
- Live phases aren't extendable by construction (`live()` is checked), but no test covers a live phase directly.
