---
id: DECISION-1
title: Host everything on one Cloudflare Worker
date: 2026-10-30
tasks: []
---

## Context

Vercel was the first idea. Vercel Functions can't hold a game room in one place, so live rooms would have needed
Cloudflare anyway, and the user wanted storage on Cloudflare. Running only the web app on Vercel would have meant two
platforms and an internal API between them.

## Decision

One Cloudflare Worker (`apps/web`) serves the React Router pages and static assets, exports the game-room and
lobby-registry Durable Objects, stores data in D1, and calls Claude directly. Vercel isn't used.

## Consequences

- One account, one `wrangler deploy`, and no shared secrets between servers.
- The free plan allows 10 ms of CPU per request. If pages or Claude calls hit it, the fix is Workers Paid ($5/month).
- Browsers open game sockets on the same origin as the pages.
