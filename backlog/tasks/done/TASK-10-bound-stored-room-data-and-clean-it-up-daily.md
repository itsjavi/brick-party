---
id: TASK-10
title: Bound stored room data and clean it up daily
priority: high
labels: [phase-1, security, data]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Nothing a room or a script does can grow storage without limit, and old data is removed on a schedule.

## Acceptance criteria

- [x] Chat keeps at most 100 messages per room, each at most 280 characters (worst case under 100 KB per room).
- [x] A room holds at most 20 people (12 play); more are turned away with a message.
- [x] Endless mode ends with the Retro Report after 40 games.
- [x] The open-rooms list keeps at most 50 rooms and shows no nicknames.
- [x] A room's saved state is wiped after it has been empty for a day.
- [x] A daily cron removes players with no matches who haven't been seen for 30 days, Claude cards unused for 90 days,
      old daily AI totals, and room codes unused for 30 days.

## Notes

- Checked on the local dev server: 20 bots fill a room and a 21st player sees "This room is full"; the open-rooms
  list and its JSON carry no nicknames; the cron, triggered with `/cdn-cgi/local/scheduled` after seeding old rows,
  removed the idle player, the old card and the old spend day and kept an old player who had a match.
- The idle wipe was checked with the idle time temporarily at 5 seconds (a chat message was gone after everyone
  left), and against the real value as a control (the message stayed).
- To stay within the free plan's Durable Object writes (100,000 rows a day), a room now saves its state at most every
  2 seconds (phase changes and the last socket closing save at once) and only rewrites its alarm when the deadline
  changes. The open-rooms list saves at most every 5 seconds. A deploy or crash can lose up to 2 seconds of a room.
- `lastSeenAt` is refreshed at most once a day from `currentPlayer`, so the cleanup only removes bricks nobody uses.
- Not verified: CPU time of the cron on the real free plan (10 ms). It runs three `deleteMany` queries.

