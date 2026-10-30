---
id: TASK-9
title: Rate-limit the public site and add Turnstile to new players
priority: high
labels: [phase-1, security]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Scripts can't mass-create players, rooms or sockets, or flood a room with messages (DECISION-11).

## Acceptance criteria

- [x] Creating players, restoring keys and creating rooms are rate-limited per IP, with a friendly error.
- [x] Room tokens and room and lobby sockets are rate-limited per IP.
- [x] Creating a player needs a valid Turnstile token when `TURNSTILE_SECRET_KEY` is set.
- [x] Every message type in a room is limited per connection, and oversized messages are dropped.
- [x] The e2e test and `pnpm bots` still work locally.
- [x] DEPLOY.md covers the Turnstile keys and the optional WAF rule.

## Notes

- Checked against the local dev server: the 21st restore in a minute gets 429 and "Too many tries from your network";
  lobby requests get 429 past the socket limit; flooding a room socket with 400 messages closes it with 4008.
- Turnstile checked with Cloudflare's always-pass test keys in a separate browser: the button stays disabled until
  the widget passes, the dummy token is accepted and the brick is created. A POST without a token gets "We couldn't
  confirm you're human".
- The docs don't say whether the Workers rate-limiting binding is on the Free plan. If a deploy rejects
  `ratelimits`, the limiters are optional: without the bindings nothing is limited (and nothing breaks).
- Limiter errors fail open (the request goes through); Turnstile network errors fail closed.

