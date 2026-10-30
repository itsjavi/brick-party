---
id: TASK-55
title: Keep a room you stepped away from on the home page
priority: high
labels: [phase-3, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Leaving a room for the home page drops it from Open rooms at once: the list counts only players who are online, and
leaving marks you away, although your seat is kept for 20 seconds in the lobby and 90 in a game. Keep the room listed
while anyone still holds a seat, and give the home page a way back to the room you just left.

## Acceptance criteria

- [x] A room stays on Open rooms while anyone holds a seat, online or away, and shows how many are away
- [x] It drops off once the last seat is let go, as before
- [x] The home page shows a "Back to your room" card for the room you last visited while it's still open
- [x] Test rooms still stay off the list
- [x] Tests for the room summary; typecheck and tests pass

## Notes

- `roomSummary` in `packages/game/src/match.ts` decides what a room reports: everyone not "left" counts, with an
  `away` count. The registry keeps `away` (0 for rooms saved before it existed). The list never shows nicknames
  (DECISION-11).
- The way back is per browser: the room page stores its code under `brickparty:last-room` (test rooms aren't stored),
  and the home page shows the card while that room is on the open-rooms list. It shows even if your own seat was let go
  while others are still playing; "Back in" then joins the room like any other visitor.
- Checked in the browser: created a room and went home, which showed "1 player, away" on the list and the card. "Back
  in" returned to the same seat as host. About 20 seconds after leaving again, the room and the card both disappeared
  from the home page without a reload.
