---
id: TASK-11
title: Let room creators keep their code for 30 days
priority: high
labels: [phase-1, rooms]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

"Create a room" never lands on someone else's room, and gives a creator the same code every time, fresh
(DECISION-13).

## Acceptance criteria

- [x] A D1 `rooms` table records each code's creator and last use.
- [x] Creating a room returns the creator's own code if they used it in the last 30 days, otherwise a free code.
- [x] Creating restarts the room fresh unless people are in it.
- [x] Playing in a room refreshes its 30 days; the daily cleanup frees older codes.
- [x] Joining by code or link never restarts a room.

## Notes

- Checked with two players in separate browsers on the local dev server: the creator got the same code back with the
  old chat gone; a busy room kept its players (no wipe) and the creator joined them; joining by link kept the chat;
  another player got a different code. Joining refreshed `last_used_at`, and the cron freed a code aged past 30 days
  while keeping a recent one.
- `GameRoom.restart()` is an RPC, reached through `getServerByName`, which waits for `onStart`. Outside requests
  can't reach it: `/parties/*` only routes sockets and the lobby's GET.
- Rooms opened by link without "Create a room" have no `rooms` row. They work as before and are only handed out by
  "Create a room" when nobody is in them.

