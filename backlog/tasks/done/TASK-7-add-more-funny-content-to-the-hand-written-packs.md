---
id: TASK-7
title: Add more funny content to the hand-written packs
priority: medium
labels: [phase-2, content]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The hand-written packs are big enough that a long session without Claude doesn't repeat itself, and funny enough to
carry the game on their own. New items mix spicy, absurd and plain funny, plus some so obvious and boring they're
funny because they're bad. Funny comes first: it's why people play.

## Acceptance criteria

- [x] Every pack grows by a large batch of new items, each pack file staying under 50 KB.
- [x] New Skip Logic starters are easy to draw: one creature or object doing one visible thing (see TASK-6).
- [x] New items stay workplace-safe at both spice levels (see the roadmap's "Always" rules).
- [x] Existing items and ids are untouched, and new ids are unique.
- [x] Content tests and the typecheck pass.

## Notes

- The user asked for "a big set of content, up to 50kb per file". 50 KB is a ceiling, not a target: a pack stops
  growing when the new items stop being funny.
- The user also asked for a round of extreme absurdity, "a bobobo or rick-and-morty level of absurdness", without
  references to those cartoons: surreal logic told deadpan, sentient abstract things, cosmic scale applied to petty
  office life. Where a pack was near 50 KB, the weakest items added in this task made room; older items stayed.
- Result, items added (file size before → after): Worst Feedback 64 prompts and 167 answers (27 → 49 KB), Bot or Not
  214 pairs (11 → 46 KB), Survey Says 218 questions (13 → 49 KB), Skip Logic 346 starters (8 → 46 KB). Each new item
  was checked against the length limits in Claude's prompts and for duplicate texts.
- Absurd rounds: wf-p-134 to wf-p-143, wf-a-390 to wf-a-425, bn-255 to bn-284, ss-298 to ss-329, sl-382 to sl-421.
- Ids have gaps where weaker new items were cut. Ids only need to be unique.
- Things to watch in the first playtest: the sharpest spicy cards (an HR "got a minute?" on Friday, a sock puppet on a
  performance improvement plan, a hiring freeze except for VPs). Spicy items only appear in spicy games. TASK-12 later
  removed the local in-jokes.
