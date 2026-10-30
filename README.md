# Brick Party

The Formbricks party game: a Jackbox-style pack of survey-themed mini-games for the team call. Everyone joins from a browser with a room code, plays a playlist of games, and ends with a Retro Report full of awards.

| Game                | What happens                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Worst Feedback Ever | Answer an absurd survey with a card from your hand or your own words. Vote for the worst. |
| Bot or Not          | One player got a slightly different question. Find the Bot before it blends in.           |
| Survey Says         | Answer a team poll, then predict how everyone else answered.                              |
| Skip Logic          | Write a survey question, draw it, describe the drawing, and watch it fall apart.          |

## How it fits together

One Cloudflare Worker runs everything:

- `apps/web`: the React Router 8 app (server-rendered), its STSX components and plain CSS, and the Worker entry (`workers/app.ts`).
- `apps/party`: the game rooms (Durable Objects) and the open-rooms list.
- `packages/game`: the rules of every game as pure functions, plus the match flow. Most game logic is tested here.
- `packages/content`: hand-written prompt packs, and optional Claude-generated prompts and judging with a daily budget.
- `packages/db`: Prisma on Cloudflare D1 for players, matches, the Hall of Fame and generated prompts.
- `apps/cli`: bots for local playtests that someone else plays, usually Claude through the `/playtest` skill. Not
  deployed.

## Run it locally

Needs Node 24+ and pnpm.

```bash
pnpm install
```

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Fill in the secrets in `apps/web/.dev.vars`. Claude is off by default and games use the hand-written packs; to try it,
set `AI_ENABLED=true` and `ANTHROPIC_API_KEY`.

```bash
pnpm --dir apps/web dev
```

Open http://localhost:5173 in a few browser windows (or private windows) to play with yourself. Open
http://localhost:5173/dev for sandboxes that need no game: the drawing editors, the fighter viewer, the UI components and
the audio lab (local development only).

To try it alone, this starts the dev server (or uses the one already running), opens a new room in your browser, and
adds 3 bots once you're in it, so you're the host:

```bash
pnpm play
```

`pnpm play 5` adds five. The bots stay idle, so the game plays their turns when timers run out. `pnpm bots BRKZ 3` adds
bots to a room that's already open. Ctrl+C removes the bots and stops the dev server if `pnpm play` started it.

Every game card on the home page also has **Test it**: a private room for that one game, with three bots on the server
filling the other seats. It works on the live site too, makes no Claude calls and isn't saved to the Hall of Fame.

For bots that play like people (answers, votes, drawings, chat and reactions), ask Claude Code to `/playtest` with
your room code: Claude plays them through `apps/cli` (`pnpm -s brick help`), with no API key involved.

## Tests

```bash
pnpm test
```

```bash
pnpm e2e
```

The end-to-end test starts the dev server and plays a short match with three browsers.

Deploying: see [DEPLOY.md](DEPLOY.md).
