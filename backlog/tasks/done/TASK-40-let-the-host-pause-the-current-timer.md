---
id: TASK-40
title: Let the host pause the current timer
priority: medium
labels: [phase-2, room, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The host can freeze the countdown of whatever phase is running, for example when someone on the call has to step away
or the team wants to talk, and start it again from where it stopped. Nobody loses time they didn't get to use.

## Acceptance criteria

- [x] The host sees a pause button in the room's top bar, next to "Skip phase", whenever a phase has a countdown: in a
      game, in the intro and in intermissions. Other players don't.
- [x] While paused, the timer stops for everyone, shows "Paused" and the time left, and no deadline passes: the server
      doesn't advance the phase or auto-submit anything.
- [x] The host resumes with the same button, and the countdown carries on from the time that was left.
- [x] Moves made before the pause are kept. While paused, players can't send game moves, but can still chat and react.
- [x] If the host leaves while paused, the new host can resume. A pause longer than 10 minutes resumes by itself, so
      a forgotten pause doesn't hold a room open.
- [x] The bot CLI shows the pause in `state`, and the autopilot doesn't play fallback moves while paused. `Test it`
      rooms pause their server-side bots too (TASK-39).
- [x] Tests cover pausing and resuming in each game, and a deadline that would have passed during the pause.

## Notes

- Today nothing pauses. The room has one `phaseEndsAt` (`packages/game/src/match.ts`), and each game keeps its own
  `endsAt` in its state, so pausing has to move every deadline, not only the room's.
- One way: the match keeps the total time spent paused and gives games a clock that stops while paused (`now` minus
  paused time), converting their deadlines back to real time in views. Then no game needs pause logic of its own. The
  other way is a new engine event that tells each game to push its deadlines back.
- The pause is a new host message next to `next`, `end` and `kick` in `packages/game/src/protocol.ts`.

Done:

- The match runs on a match clock: real time minus `pausedTotal`, frozen at `pausedAt` while paused. Every game event,
  `phaseEndsAt` and bot plan uses it, so no game has pause code; `nextDeadline` converts back to real time. Views send
  `serverNow` on the match clock plus `paused` and `clockEpoch`, and the client's clock stands still while paused and
  resyncs at once when the epoch changes.
- Held while paused: moves, "Got it", skip, start and ticks. Chat, reactions, joining, leaving and kicking go on, and
  "End match" ends the pause. Away time stays on real time (`awaySince`), so a host who disconnects times out and
  the next host can resume.
- The CLI shows `[paused]`, its autopilot waits, and queued `act` moves wait for the resume instead of being lost.
  `Test it` bots don't move while paused.
- Verified in a Survey Says test room in the browser: the timer held at 33 seconds through an 11-second pause and
  carried on after Resume. `pause.test.ts` covers all four games, the intro, the 10-minute limit and host handover.
