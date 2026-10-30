# Brick Party

The Formbricks party game: a Jackbox-style pack of survey-themed mini-games for the team call. Everyone joins from a
browser with a room code, plays a playlist of games, and ends with a Retro Report full of awards. It runs as one
Cloudflare Worker: React Router 8 with STSX components, Durable Object game rooms, and D1 through Prisma. See
[README.md](README.md) for the layout and how to run it, and [DEPLOY.md](DEPLOY.md) for deploying.

Keep the team anonymous in every file (docs, backlog, code, prompts and content): describe the audience generically,
as players from many countries, never where the team's people come from or live, or how many there are. The repository
may go public.

## New games

A game isn't done until bots can play it. Every new minigame, and every change to how a game is played, also updates
its bot moves in `packages/game/src/bots.ts` (what a player still has to do, with a simple fallback move; "Test it"
rooms and the CLI's autopilot both play these), the CLI's `state` lines in `apps/cli/src/moves.ts`, and the
`playtest-driver` agent's instructions. It gets tests, plays to the end in a "Test it" room, and gets through a full
`/playtest` match with bots.

## Scratch space

`.local/` at the repository root is the scratch space for agents and people. It is git-ignored, so nothing in it is
committed, reviewed or shared with other clones. Put every temporary file there: experiments and throwaway scripts,
downloaded sources and documentation, generated output such as renders, screenshots and logs, and working notes.

- Don't leave scratch files anywhere else in the repository, and don't commit them.
- Nothing outside `.local/` may depend on what's in it. Anyone can empty it at any time.
- It isn't memory. Findings, plans and choices that must outlive the session go in the backlog (a task's Notes or a
  decision), never only in `.local/`.

## Backlog

Work and decisions are tracked in `backlog/`. It's this project's durable memory: it travels with the repository to
every clone and machine. Read [backlog/backlog.md](backlog/backlog.md) for the formats, and use its script rather than
reading folders by hand. Known gaps and planned work are tasks (`backlog/backlog.py list draft todo`). Run it from the
repository root; `backlog.py` below is short for `backlog/backlog.py`.

- Start by running `backlog/backlog.py status`. If it lists proposed decisions waiting for the user, mention them.
- Unless the user asks for something specific, take `backlog/backlog.py next`. If a task's notes contain an open
  decision, ask the user before building on a guess.
- Changes to the backlog system itself (its guide, script or layout) are made directly and never get tasks. Keep
  project-specific backlog rules in this file, not in the guide, so the `devbacklog-setup` skill can upgrade the guide
  and script in place.
- Before starting a task, run `backlog.py move TASK-N in-progress`. Keep one task in progress at a time.
- Work the user asks for that isn't in the backlog and takes more than a few steps gets a task first (`backlog.py new`).
- Tick acceptance criteria and record findings in the task's Notes as you go.
- When every criterion is met and verified, run `backlog.py move TASK-N done` and commit the move with the change. If
  something couldn't be verified, leave the task in progress and say why in its Notes. Tasks that won't be done go to
  `wont-do`, with the reason in their Notes.
- Put follow-up work in new tasks (`--state draft` when unclear) instead of widening the current one.
- Only **accepted** decisions are valid for agent work. Before changing an area, read its accepted decisions
  (`backlog.py decisions --status accepted`, `backlog.py show DECISION-N`) and don't work against them. Proposed and
  deprecated decisions are not binding.
- Record choices that constrain future work with `backlog.py decide`. It creates them as **proposed**, which agents may
  do on their own. Accept a decision (`backlog.py accept`) only when the user made or approved it; their answer to your
  question counts. To change an accepted decision, ask the user, record the new one, and deprecate the old one with
  `--replaced-by`.
- Run `backlog.py check` before committing backlog changes.
- High-level goals live in [backlog/ROADMAP.md](backlog/ROADMAP.md). Label every task with its phase (`phase-0`,
  `phase-1`, …).
