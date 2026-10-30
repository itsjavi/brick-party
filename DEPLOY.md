# Deploying Brick Party

Everything runs in one Cloudflare Worker, `brick-party` (`apps/web`):

- React Router server rendering and the static assets.
- The party server: one Durable Object per room (`GameRoom`) plus the open-rooms list (`LobbyRegistry`),
  reached at `/parties/*` (`apps/party`).
- The D1 database (players, matches, prompt cards), accessed through Prisma (`packages/db`, `@prisma/adapter-d1`).
- Optional Claude calls for game content and judging (`packages/content`), made straight from the Worker.

Follow [First deploy](#first-deploy) once per Cloudflare account, then [Deploying changes](#deploying-changes)
every time after that. Run every command from the repository root.

## First deploy

### 1. Install and sign in

You need Node, pnpm and a Cloudflare account (the free plan is enough).

```bash
pnpm install
pnpm --dir apps/web exec wrangler login
pnpm --dir apps/web exec wrangler whoami
```

`login` opens a browser to approve access. `whoami` should show the account you want to deploy to. If you belong to
several accounts, set `CLOUDFLARE_ACCOUNT_ID` to the right one in your shell before going on.

### 2. Create the database

Skip this step if `pnpm --dir apps/web exec wrangler d1 list` already shows `brick-party` with the same id as
`database_id` in `apps/web/wrangler.jsonc`.

```bash
pnpm --dir apps/web exec wrangler d1 create brick-party
```

If it asks whether to add the database to your Wrangler config, answer no. Copy the `database_id` it prints, open
`apps/web/wrangler.jsonc`, and replace the `database_id` value in the `DB` entry under `d1_databases` with it. Then
check that only that line changed:

```bash
git diff apps/web/wrangler.jsonc
```

If the command rewrote more of the file (an extra binding, new formatting), run
`git checkout apps/web/wrangler.jsonc` and paste the id again. The id isn't a secret, so commit it.

### 3. Create the tables

```bash
pnpm --dir apps/web db:migrate
```

Answer yes when it asks to apply the migrations. It ends with a table of migrations, each marked ✅.

### 4. Deploy the Worker

```bash
pnpm --dir apps/web deploy
```

It builds the app, uploads it and prints the public URL, `https://brick-party.<your-subdomain>.workers.dev`. If the
account has no `workers.dev` subdomain yet, it asks you to pick one first. The game can't sign players in until the
next step is done.

### 5. Set the secrets

These sign the player cookie and the room tokens. Each command stores a long random value and redeploys the Worker
with it:

```bash
openssl rand -base64 32 | pnpm --dir apps/web exec wrangler secret put SESSION_SECRET
```

```bash
openssl rand -base64 32 | pnpm --dir apps/web exec wrangler secret put GAME_JWT_SECRET
```

You never need these values yourself. Setting `SESSION_SECRET` again later signs every player out.

### 6. Turn on Turnstile

Turnstile checks that each new player is a person. Without it anyone can script new players, so don't skip it on a
public URL.

1. In the Cloudflare dashboard, open Turnstile and choose Add widget.
2. Name it `brick-party`, add the hostname from step 4 (`brick-party.<your-subdomain>.workers.dev`, without
   `https://`), and choose Managed mode. Create it.
3. Copy the site key into `TURNSTILE_SITE_KEY` under `vars` in `apps/web/wrangler.jsonc`. It's public, so commit it.
4. Store the secret key, pasting it when asked, and deploy again so the site key is live:

```bash
pnpm --dir apps/web exec wrangler secret put TURNSTILE_SECRET_KEY
```

```bash
pnpm --dir apps/web deploy
```

### 7. Turn on Claude (optional)

Skip this to play with the hand-written packs. To let Claude write prompts and judge guesses, set `AI_ENABLED` to
`"true"` under `vars` in `apps/web/wrangler.jsonc`, store an Anthropic API key and deploy again:

```bash
pnpm --dir apps/web exec wrangler secret put ANTHROPIC_API_KEY
```

```bash
pnpm --dir apps/web deploy
```

Set a monthly spend limit on the key's workspace in the Anthropic Console too. [Claude](#claude-optional) explains
the daily budget.

### 8. Check that it works

Open the URL in three browsers (or private windows). Make a brick in each, create a room in one, join it from the
others, and play a round through to the Retro Report. While you play, watch the Worker's logs for errors:

```bash
pnpm --dir apps/web exec wrangler tail
```

Error 1102 in the logs means the Worker ran out of CPU time; the fix is the Workers Paid plan ($5/month).

## Deploying changes

### 1. Get the code you want to ship

```bash
git switch main
git pull
pnpm install
pnpm --dir apps/web exec wrangler whoami
```

`whoami` should show the account from the first deploy. If it says you're not signed in, run
`pnpm --dir apps/web exec wrangler login`.

### 2. Check the build

```bash
pnpm test
pnpm typecheck
```

Don't deploy if either fails.

### 3. Set any new secrets

The comment at the end of `apps/web/wrangler.jsonc` lists the secrets the Worker uses. Compare it with what's set:

```bash
pnpm --dir apps/web exec wrangler secret list
```

Set anything missing with `wrangler secret put`, as in [step 5](#5-set-the-secrets) of the first deploy.

### 4. Update the database

```bash
pnpm --dir apps/web db:migrate
```

It's safe to run every time: it applies only the migrations the database doesn't have yet, or says there are none.
Run it before deploying, since new code may need the new tables. Deploy straight after, because a migration that
removes or renames a column breaks the running code until the new code is live.

### 5. Deploy

```bash
pnpm --dir apps/web deploy
```

Then open the URL, play a quick round, and check `pnpm --dir apps/web exec wrangler tail` for errors.

### If something breaks

Put the previous version of the code back:

```bash
pnpm --dir apps/web exec wrangler rollback
```

This doesn't undo database migrations. If the old code can't work with the new tables, fix forward instead: write a
new migration or a code fix and deploy it.

## Reference

### Abuse protection

The site is public (DECISION-11), so it limits what one visitor can do:

- `ratelimits` in `wrangler.jsonc`: `FORM_LIMITER` allows 20 new players, key restores or new rooms a minute per IP,
  and `SOCKET_LIMITER` allows 120 room and lobby sockets a minute per IP (and 120 room tokens per player). Their
  `namespace_id`s must be unique in the Cloudflare account. Counts are kept per Cloudflare location, so they're
  approximate.
- Turnstile checks every new player while both keys are set. Without them it's skipped, so set them in production.
- Rooms drop messages from a connection that sends more than 8 a second, and close it if it keeps going.

Requests the Worker turns away still count towards the Workers free plan's 100,000 a day. If the game runs on a
custom domain (WAF rules don't cover `workers.dev`), a WAF rate-limiting rule stops floods before the Worker runs.
The free plan allows one rule, counted per IP over 10 seconds: for example, block an IP for 10 seconds after 150
requests to `/*` in 10 seconds. A page load fetches about 30 files, so don't go much lower.

### Claude (optional)

Claude is off unless you switch it on ([step 7](#7-turn-on-claude-optional) of the first deploy). Without
`AI_ENABLED` set to `"true"` and the `ANTHROPIC_API_KEY` secret, games use the hand-written packs and judge guesses
with fuzzy matching.

`AI_DAILY_BUDGET_USD` (default 3) caps the estimated Claude spend per UTC day; after that, games fall back until
midnight UTC. An hour-long session costs well under a dollar, so 3 is a few sessions a day and at most about $90 a
month. Also set a monthly spend limit for the key's workspace in the Anthropic Console, since the budget is an estimate.
The Worker logs each call's tokens and estimated cost (`[ai] ...` in the Workers logs).

`CONTENT_MODEL` (default `claude-opus-5-5`), `JUDGE_MODEL` (default `claude-haiku-5-5`) and `GAME_PACE` are
plain vars in `wrangler.jsonc`. If you change a model, check its price in `estimateCost`
(`packages/content/src/ai.ts`).

### Data limits and cleanup

Nothing a room or a script does can grow storage without limit:

- A room keeps at most 100 chat messages of up to 280 characters, holds at most 20 people (12 play), and endless
  mode ends after 40 games. Its state is saved at most every 2 seconds (phase changes at once), because Durable
  Objects on the free plan get 100,000 row writes a day. A room that has been empty for a day forgets everything.
- The open-rooms list keeps at most 50 rooms and shows no nicknames.
- "Create a room" gives a player their own code back (fresh, unless people are in it) while they keep using it, and
  a free code otherwise (DECISION-13). The `rooms` table records who holds which code.
- A daily cron (`triggers` in `wrangler.jsonc`, 03:17 UTC) deletes players who never finished a match and haven't
  been seen for 30 days, Claude cards nobody upvoted and nobody used for 90 days, daily spend totals older than
  90 days, and frees room codes nobody has used for 30 days. Run it locally with `curl http://localhost:5173/cdn-cgi/local/scheduled`; the Worker logs
  `[cleanup] removed ...`.

### Changing the database schema

The schema lives in `packages/db/prisma/schema.prisma`; migrations are plain SQL files in
`packages/db/migrations`, applied by wrangler (Prisma never connects to D1 itself).

```bash
# After editing packages/db/prisma/schema.prisma:
pnpm db:diff add_something        # writes packages/db/migrations/000N_add_something.sql
pnpm db:migrate:local             # applies it to the local D1
pnpm --filter @brick/db generate  # regenerates the Prisma client (dev, build and typecheck also do this)
```

The migration reaches the deployed database in step 4 of [Deploying changes](#deploying-changes).

`db:diff` rebuilds a temporary SQLite database from the existing migration files and diffs it against the
schema, so it never depends on your local D1 state. Review the SQL before applying it: SQLite changes that
alter a column rebuild the table.

### Local development

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm install
pnpm --dir apps/web dev   # generates the Prisma client, applies local D1 migrations, serves http://localhost:5173
```

The dev server runs the Worker in workerd with the same bindings as production (local D1 and Durable Objects
live in `apps/web/.wrangler`). Add `GAME_PACE=0.05` to `.dev.vars` to make every phase 20 times faster.
