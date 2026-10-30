---
id: TASK-1
title: Deploy Brick Party to Cloudflare
priority: high
labels: [phase-1, deploy]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The team can open a public URL and play Brick Party, served by one Cloudflare Worker with its D1 database, as
planned in DEPLOY.md.

## Acceptance criteria

- [x] The `brick-party` D1 database exists and its id replaces the placeholder in `apps/web/wrangler.jsonc`.
- [x] Remote migrations are applied (`pnpm --dir apps/web db:migrate`).
- [x] `SESSION_SECRET`, `GAME_JWT_SECRET` and `ANTHROPIC_API_KEY` are set with `wrangler secret put`.
- [x] `pnpm --dir apps/web deploy` succeeds and prints the public URL.
- [x] Three browsers on the deployed URL can make bricks, join a room, play a round and reach the Retro Report.
- [x] The Worker's logs show no CPU-limit errors (Error 1102) during that round. If they do, note it here: the fix is
      Workers Paid ($5/month).

## Notes

- `wrangler login` and the secret values need the user's Cloudflare account.
- The free plan allows 10 ms of CPU per request; waiting on D1 or Claude doesn't count.
- The match save writes rows one at a time (D1 through Prisma has no transactions), so a failure can leave a partial
  match.
- The user finished the deploy by hand and confirmed every criterion above.
