---
id: TASK-30
title: Drive playtest bots from a lean subagent
priority: medium
labels: [phase-1, playtest, cli]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A playtest costs far less to run. The bots are driven by a subagent with only Bash and Read on Sonnet, instead of
the main Claude Code session with every connector and skill loaded, so each decision reads a small context.

## Acceptance criteria

- [x] `brick next` waits for the next event worth a decision and prints it with the state, so a driver needs no watch.
- [x] A `playtest-driver` agent in `.claude/agents/` (tools Bash and Read, model sonnet) holds the persona and table-talk rules and loops `brick next` and `brick act`.
- [x] The `/playtest` skill starts the bots and hands the match to the driver; the user still talks to the bots in the game chat.
- [x] The skill says `delay` is in seconds.
- [x] A full match runs with the driver, with no `[auto]` fallbacks from slow decisions.

## Notes

- From a local playtest: two full matches driven from the main session took about 230 requests at an average
  context of about 140k tokens, around $8 at Sonnet 5.5 API prices. Most of that is re-reading about 80k tokens of
  tools, connectors and skills the playtest never uses.
- The driver's context still grows by about 1-2k tokens per event; restarting it at a game break would cap that.
- Swapping a Worst Feedback card takes the driver an extra round trip (swap, read the new hand, play).
- Verified with a one-game match (Survey Says) in a test room: the driver played all five rounds with no
  `act` errors and no `[auto]` or `[late]` fallbacks, then finished on `[quiet]` after the report. The run used a
  general-purpose agent on Sonnet following `.claude/agents/playtest-driver.md`, because agent files load only at
  session start; the `playtest-driver` type itself showed up as available afterwards.
- `brick next` keeps its own read position, separate from `events.log`, so a Monitor on the log still works for anyone
  who prefers driving from the main session.
