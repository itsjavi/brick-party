---
id: DECISION-12
title: Claude features are opt-in and capped by a daily budget
date: 2026-10-30
tasks: [TASK-8]
---

## Context

DECISION-7 called Claude whenever an API key was set. On a public site (DECISION-11) anyone can start games, and every
game and judgement costs money. The user asked for AI features to be opt-in, with deterministic fallbacks such as
Levenshtein distance for close answers.

## Decision

- Claude runs only when `AI_ENABLED` is `true` and `ANTHROPIC_API_KEY` is set. Otherwise no Claude call is made.
- Calls go through the AI SDK (`ai` and `@ai-sdk/anthropic`). Content uses `CONTENT_MODEL` (default `claude-opus-5-5`),
  judging uses `JUDGE_MODEL` (default `claude-haiku-5-5`). No sampling parameters are sent, and refusal fallbacks only
  go to models that support them.
- Spend is estimated from each call's token usage and the models' list prices, and added up per UTC day in D1. Once it
  reaches `AI_DAILY_BUDGET_USD` (default 3), no more Claude calls are made until the next UTC day.
- Without Claude, content comes from the hand-written packs, and judging uses fuzzy matching: keyword overlap that
  tolerates typos (Levenshtein distance), plus whole-answer similarity for near-identical answers.
- When AI is off, the game doesn't mention Claude (no "Claude is judging", no "Claude's verdict").

## Consequences

- AI is off by default, including locally and in tests.
- Skip Logic's drawing judge (DECISION-9) is Claude only when AI is on; otherwise the fuzzy judge scores the guesses.
- The budget is an estimate. The price table lives in code and must be updated when models or prices change; unknown
  models are priced as the most expensive known one. Worst-case spend is about 30 times the daily budget per month.
