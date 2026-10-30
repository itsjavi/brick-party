---
id: DECISION-14
title: Tag every pack item with a topic and a style, and cap pack files at 70 KB
date: 2026-10-30
tasks: [TASK-12]
---

## Context

The hand-written packs grew to about 1,500 items. The user worried that most jokes were about SaaS, surveys and office
life, and that spicy items were too vanilla, and asked to "categorize (use enum sets) all the static content we have,
to know which balance we have right now. and to know what to swap". Tagging grows each file by about 40 bytes per item,
so the user set the size limit: "cap files to 70kb. when content doesnt fit some entry has to go away."

## Decision

- Every pack item has a `topic` and a `style` besides its `spice`. The values are fixed sets defined in
  `packages/content/src/categories.ts`, each with a one-line definition.
- `pnpm --filter @brick/content balance` prints how each pack splits across topics, styles and spice.
- Each pack file stays at or under 70 KB, tags included. When content doesn't fit, the weakest items go.
- Tags never reach players: `packContent` strips them along with `spice`.
- How to write content, including the audience and the mix to aim for, lives in `packages/content/packs/README.md`.

## Consequences

- Tests fail when an item has an unknown or missing topic or style, or when a pack file passes 70 KB.
- Adding a topic or style means editing `categories.ts` and retagging the items it fits.
- Claude's generated content isn't tagged; only the hand-written packs are.
