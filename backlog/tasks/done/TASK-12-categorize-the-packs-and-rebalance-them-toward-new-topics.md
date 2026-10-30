---
id: TASK-12
title: Categorize the packs and rebalance them toward new topics
priority: medium
labels: [phase-2, content]
depends_on: [TASK-7]
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Every hand-written pack item is tagged with a topic and a style, so the packs' balance can be measured, and the packs
are rebalanced the way the user asked: no regional in-jokes, spicy items that actually punch, and far more jokes
about Formbricks itself, AI, product, UX, accessibility and software engineering, not mostly SaaS, surveys and office
life.

## Acceptance criteria

- [x] Every item has a topic and a style from `categories.ts`, and tests reject unknown or missing ones.
- [x] `pnpm --filter @brick/content balance` prints the balance per pack.
- [x] No regional in-jokes are left.
- [x] Spicy items are satire, dark or unhinged, with a real punch.
- [x] Office, startup and surveys together are at most 35% of each pack except Skip Logic (at most 25% there), and
      the newer topics reach the targets agreed in this task's notes.
- [x] Each pack file stays under 70 KB, tags included, and content tests and the typecheck pass.

## Notes

- The user's feedback: players come from many countries, so city in-jokes miss many of them; some spicy items are "too vanilla and not punchy or ridiculous"; aim for the ridiculousness of Rick and Morty
  or Bobobo-bo Bo-bobo without referencing them; roast Formbricks' own features and AI "from catastrophic to brilliant
  future, from taking over our jobs to using us like in matrix", plus UX, accessibility, product and engineering jokes
  for 2026/2027 and beyond.
- Size: the user capped pack files at 70 KB, tags included (DECISION-14).
- Targets per pack (Worst Feedback, Bot or Not, Survey Says): office + startup + surveys at most 35%; ai at least 15%,
  formbricks at least 8%, engineering at least 8%, product at least 6%, ux at least 6%, accessibility at least 3%;
  unhinged at least 20%, anti about 10%; at least 85% of spicy items satire, dark or unhinged. Skip Logic must stay
  drawable: ai at least 10%, ux + accessibility + engineering + product + formbricks at least 15%, office + startup +
  surveys at most 25%, unhinged at least 25%.
- Result (all four packs): 1,519 items before, 1,585 after. Office + startup + surveys went from 41% to 23% of all
  items, ai from 1% to 15%, formbricks from 0% to 8%, accessibility from 0% to 3%, product from 2% to 6% and ux from 2%
  to 7%. Unhinged went from 8% to 22%. The share of spicy items that are satire, dark or unhinged went from 48% to
  over 99%. Per pack, every target above is met.
- About 590 original items were cut, about 100 were rewritten in place (keeping their ids), and about 660 were
  added. Some spicy items that were good but not punchy became mild instead.
- Regional references (city nightlife, local food, bureaucracy, local currency and units) were replaced or cut.
- Judgment calls to watch in play: a few dark items (an all-hands described like a hostage video, a eulogy, an NPS
  survey on a sinking ship), anti-humor pairs in Bot or Not where the Bot can't be caught on purpose, and several
  unhinged Survey Says questions built on the same sentient-concept pattern.
