---
id: TASK-32
title: Check how the Skip Logic judge scores close paraphrases
priority: medium
labels: [phase-1, ai]
depends_on: [TASK-2]
created: 2026-10-30
---

## Goal

Skip Logic scores a description that says the same thing in other words as close, not as a miss.

## Acceptance criteria

- [ ] Close paraphrases score at least 7/10 with the judge used in production.

## Notes

- In a local playtest (no API key), "Rate the treehouse built in a very small tree." against "Rate, 1 to 5,
  the house balanced on a tiny tree." scored 4/10. That may be the offline fallback judge; check with a real key
  under TASK-2 before changing anything.
