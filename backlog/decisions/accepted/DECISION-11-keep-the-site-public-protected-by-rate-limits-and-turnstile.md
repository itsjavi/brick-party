---
id: DECISION-11
title: Keep the site public, protected by rate limits and Turnstile
date: 2026-10-30
tasks: [TASK-9, TASK-10]
---

## Context

Brick Party is about to go live on a public URL (TASK-1). Anyone can create players, open rooms and start games, so a
script could fill D1, flood the open-rooms list, use up the Workers free-plan quotas or run up the Claude bill. Putting
Cloudflare Access (company Google login) in front of the site was considered; the user chose to keep the site open
without sign-in, in line with DECISION-6.

## Decision

The site stays public, with these protections:

- Cloudflare's Workers rate limiting, keyed by client IP, on creating players, restoring keys, creating rooms, minting
  room tokens and opening sockets.
- Turnstile on creating a player.
- Per-connection message limits inside rooms, for every message type.
- The open-rooms list shows each room's code, player count and phase, never nicknames, and at most 50 rooms.

## Consequences

- Turnstile needs `TURNSTILE_SITE_KEY` (a var) and `TURNSTILE_SECRET_KEY` (a secret). Without the secret it is skipped,
  which keeps local development and the e2e test offline-friendly; production must set both.
- People behind one IP share its limits, so the limits stay generous. Workers rate limits are counted per Cloudflare
  location, so they are approximate.
- Requests the Worker rejects still count against the Workers request quota; a WAF rate-limiting rule in the dashboard
  can stop floods before the Worker runs.
