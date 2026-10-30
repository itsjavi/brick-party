---
id: TASK-8
title: Make Claude features opt-in with a daily budget
priority: high
labels: [phase-1, ai, security]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Claude only runs when it's switched on, can't spend more than a set amount a day, and the game plays just as well
without it (DECISION-12).

## Acceptance criteria

- [x] Claude is called only when `AI_ENABLED=true` and `ANTHROPIC_API_KEY` is set; `CONTENT_MODE` is gone.
- [x] Each call's estimated cost is added to a per-day total in D1; at `AI_DAILY_BUDGET_USD` (default 3) calls stop
      until the next UTC day, and games fall back without errors.
- [x] The fallback judge accepts near-identical answers and typos (Levenshtein), for Bot or Not guesses and Skip Logic
      closeness, with tests.
- [x] With AI off, no screen or rule mentions Claude.
- [x] Docs and `.dev.vars.example` describe the new settings.

## Notes

- Prices per million tokens (input / output): Opus 5.5 $4 / $20, Haiku 5.5 $0.10 / $0.50, Sonnet 5.5 $2 / $10,
  Fable 5.1 $10 / $50. Thinking is billed as output.
- Rough estimate before measuring: one Opus content call is about $0.10, so an hour-long session (about 8 games) costs
  under $1. Judging with Haiku is a fraction of a cent. TASK-2 should check real usage in the logs and adjust the
  default budget.
- `aiAvailable` fails closed: if today's spend can't be read from D1, Claude is skipped.
- The fuzzy judge allows one typo from 4 letters and two from 8; shorter words must match exactly. Whole answers at
  least 90% alike (edit distance) count as the same answer. A lower threshold made "favorite snack" and "favorite
  drink" a match.
- Each call logs `[ai] <what>: <model>, N in, N out, ~$cost`, for TASK-2 to measure real costs.

