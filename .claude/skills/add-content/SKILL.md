---
name: add-content
description: Write content for Brick Party's hand-written packs. Use when asked to add jokes, prompts, questions or starters to a game, to rework, punch up or rebalance a pack, or to write the first pack for a new minigame.
---

# Add pack content

You're the coordinator: you settle the brief with the user, hand each pack to a writer, review every item that comes
back, and report the balance. The packs live in `packages/content/packs/`, one JSON file per game. The content guide
next to them, [README.md](../../../packages/content/packs/README.md), holds the rules (format, audience, safety, mix,
each game's limits) and wins over anything here. Funny comes first: it's why people play.

Run these from the repository root:

- `python3 .claude/skills/add-content/scripts/check.py` checks every pack against the rules and the size cap, and
  prints each pack's free room. Clean means no PROBLEM and no WARNING lines.
- `python3 .claude/skills/add-content/scripts/pack.py` appends, updates and removes items without breaking the
  one-item-per-line format.
- `python3 .claude/skills/add-content/scripts/changes.py` lists new, rewritten and removed items since a git ref
  (default `HEAD`), for review.
- `pnpm --filter @brick/content balance` prints each pack's split by topic, style and spice.

## 1. Take stock

1. Run the balance command and `check.py`.
2. Read the content guide, `packages/content/src/categories.ts` (the topic and style sets) and
   [influences.md](influences.md), which explains what this game's humor is modeled on. It's for you alone.
3. Find the Formbricks docs for writers who roast its features: a local Formbricks checkout's `docs/` folder if one
   sits next to this repository or among your working directories, otherwise formbricks.com/docs.
4. For a game that has no pack yet, follow [new-game.md](new-game.md) first.

Done when you know, for each pack the request touches, its item count, its free room under the cap, and its thinnest
topics and styles.

## 2. Settle the brief

Ask with AskUserQuestion (up to four questions per call), only what the request leaves open, recommending the option
the balance supports. When the request implies a style or topic (a roast is satire, "AI jokes" is the ai topic),
follow it, and use the balance to vary everything else.

- **Packs:** which games.
- **Kind:** spread evenly across every topic and style the game can carry; fill the thinnest topics; a specific
  topic, style or theme; or punch up existing items.
- **Amount:** a number of items per pack, or as many as fit.
- **Room:** add only, or replace the weakest items to make room.
- **Size cap:** keep `PACK_MAX_BYTES` in `packages/content/src/packs.ts`, or change it.
- **Spice:** keep about a third spicy, or shift it.

When you can't ask (no AskUserQuestion, or you're running as a subagent), take the option you'd recommend for each and
list your picks in the report.

`check.py` prints how many average-sized items fit in each pack; long items, like choice questions with four options,
take more. If the user picks a new cap, set `PACK_MAX_BYTES`, record the change with `backlog/backlog.py decide`,
accept it (their answer is the approval), and deprecate the decision that set the old cap (`backlog/backlog.py
decisions` finds it) with `--replaced-by`.

Done when every pack in play has an amount, a target mix of topics, styles and spice, add-only or replace, and a cap,
and the brief is in the notes of a backlog task that's in progress.

## 3. Brief the writers

Give each pack to one writer with the template in [writer-brief.md](writer-brief.md), filled in for that pack. With
two or more packs, or 40 or more items in one pack, run the writers as parallel subagents, each owning one file.
Fewer than 40 items in one pack you write yourself, following the same brief.

Writers get the craft from [humor.md](humor.md) and the topics from [material.md](material.md), never the names or
sources in influences.md. When the user's words name a show, film or book, quote them with the name replaced by the
mechanism in square brackets, like "add 40 [extreme deadpan absurdity] pairs".

Done when every pack in play has a writer working from a filled-in brief, or you've written its batch.

## 4. Review every change

Run `changes.py` and judge every NEW, REWRITTEN and REMOVED line. A new or rewritten item stays when it is:

- **Funny** on the first read, with nothing to explain.
- **Playable:** it fits the game's mechanics in the content guide. Skip Logic starters can be drawn in ten seconds.
- **Original:** its premise isn't already in the pack, and nothing in it comes from a show, film or book. Globally
  known products are fine.
- **Universal:** everyone gets it, wherever they're from.
- **Safe** by the content guide's audience rules, which include keeping the real team anonymous.
- **Tagged honestly:** the topic is what the joke targets, so an item written for a requested topic really targets
  it, and a spicy item is satire, dark or unhinged with a real punch.

A removed item was really among the weakest, and its topic wasn't already below target. Fix small things with
`pack.py update`, cut with `pack.py remove`, restore a good cut by appending it back with its old id, and send a writer
back with specific notes when a batch misses the brief.

Done when every NEW, REWRITTEN and REMOVED line has been judged and every failure is fixed, cut or restored.

## 5. Verify and report

1. Run `check.py` until it's clean, then `pnpm --filter @brick/content test` and
   `pnpm --filter @brick/content typecheck`.
2. Measure the change: `changes.py --before .local/content-before` writes the packs as they were at `HEAD`, so
   `pnpm --filter @brick/content balance .local/content-before` prints the before, and the plain balance command the
   after.
3. Report to the user: the balance before and after for the topics and styles that moved, how many items were added,
   rewritten and cut per pack, a handful of favorites, any brief choices you made for them, and the judgment calls
   they may want to check in play. Record the same in the backlog task's notes.
