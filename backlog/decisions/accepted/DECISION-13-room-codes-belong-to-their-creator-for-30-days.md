---
id: DECISION-13
title: Room codes belong to their creator for 30 days
date: 2026-10-30
tasks: [TASK-11]
---

## Context

"Create a room" picked a random code without checking anything, so a new room could land on an old room and inherit
its members, chat and report, or on a room that was in use. The user asked for codes to be reusable, starting fresh,
and to stay with their creator, so a team can keep one link for its weekly call.

## Decision

- A D1 `rooms` table records each code's creator and when the room was last used.
- "Create a room" gives the creator their own code if they used it in the last 30 days. Otherwise it gives a code that
  nobody owns and nobody is in.
- Creating restarts the room fresh (members, chat, scores, report) unless people are in it right now; then the creator
  just joins them.
- Playing in the room keeps it the creator's. After 30 days without use, the daily cleanup frees the code.
- Joining by code or link never restarts a room. Retro Reports already saved in D1 stay.
- Codes stay four consonants (160,000 codes).

## Consequences

- Each player owns at most one code.
- A room's live state is temporary: it is wiped after the room has been empty for a day.
- Codes can't run out in practice: only codes used in the last 30 days are taken. If none is free, creating a room
  fails with a message instead of reusing a busy code.
