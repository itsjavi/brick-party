---
id: TASK-15
title: Check the rate limits and cleanup cron on the live free plan
priority: high
labels: [phase-1, deploy, security]
depends_on: [TASK-1]
created: 2026-10-30
---

## Goal

The protections from TASK-9 and TASK-10 work on the deployed Worker, not only in local dev, where Miniflare simulates
the rate limiter and the cron has no CPU limit.

## Acceptance criteria

- [ ] The deploy accepts the `ratelimits` bindings on the Workers free plan.
- [ ] On the live site, the 21st key restore in a minute from one IP gets 429 and "Too many tries".
- [ ] With the real Turnstile keys, the widget shows on the live hostname and creating a brick works.
- [ ] The daily cron runs within the free plan's 10 ms CPU: the Workers logs show the `[cleanup] removed ...` lines
      and no CPU-limit errors.
- [ ] After a playtest, the dashboard shows how many Durable Object rows were written, compared with the 100,000-a-day
      limit.

## Notes

- Cloudflare's docs don't say whether the rate-limiting binding is on the free plan. If the deploy rejects
  `ratelimits`, drop the bindings and stay on the free plan (the user's call): nothing gets limited, nothing breaks,
  and Turnstile still guards brick creation.
- If the cron goes over 10 ms of CPU, its three Prisma `deleteMany` calls could become raw D1 statements, or the
  jobs could be spread over several runs.
- Rate-limit counts are kept per Cloudflare location, so a test from one place sees one location's count.
- Rooms save their state at most every 2 seconds (TASK-10), so a game should use far fewer writes than before.
