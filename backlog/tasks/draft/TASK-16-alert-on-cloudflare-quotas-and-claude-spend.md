---
id: TASK-16
title: Alert on Cloudflare quotas and Claude spend
priority: medium
labels: [phase-1, deploy]
depends_on: [TASK-1]
created: 2026-10-30
---

## Goal

Someone hears about it before a free-plan quota runs out mid-game or the Claude bill jumps, instead of the team
finding a broken game on the call.

## Acceptance criteria

- [ ] The Anthropic workspace for the game's key has a monthly spend limit and an email alert.
- [ ] Cloudflare sends a notification as Workers requests, Durable Object writes or D1 writes near their daily limits,
      if the free plan offers that (see Notes).
- [ ] DEPLOY.md says where the alerts go and where to look: the `[ai]` and `[cleanup]` lines in the Workers logs, and
      the D1 and Durable Objects usage pages.

## Notes

- Free-plan daily limits: 100,000 Worker requests, 100,000 Durable Object rows written, 100,000 D1 rows written. They
  reset at midnight UTC.
- In the game, `AI_DAILY_BUDGET_USD` (default 3) already stops Claude calls once the estimated spend for the day is
  reached. The Console limit is the backstop, because that budget is an estimate.
- Open question: which Cloudflare notifications the free plan offers for these usage limits. Check the notifications
  docs before building anything; if there are none, a small daily check (the cron could log usage) may do.
- The alerts go to the project owner's account email only, for now.
