---
id: TASK-17
title: Add a skill for writing pack content
priority: medium
labels: [phase-2, content]
depends_on: [TASK-12]
created: 2026-10-30
completed: 2026-10-30
---

## Goal

An `add-content` skill lets any agent add or rework the hand-written packs the way TASK-7 and TASK-12 did: it asks the
user what kind of content and how much, which size cap to keep, brings in the humor craft and topic material, briefs
one writer per pack, reviews every new item and reports the balance. It also covers the first pack of a future
minigame.

## Acceptance criteria

- [x] The skill asks only what the request leaves open: which packs, what kind of content (evenly across categories,
      specific topics or styles, punching up), how much, add-only or replace, and the file size cap.
- [x] Writers get the comedic mechanics behind the influences discussed in TASK-12, never the influences' names or
      sources; the coordinator can read those in a file of its own.
- [x] The pack tool and checker live with the skill (not in `.local/`), work from any checkout, and handle a pack
      for a new game.
- [x] The size cap has one source of truth that the test and the checker both read.
- [x] A fresh agent following the skill on a small batch produces valid, reviewed content.

## Notes

- The user's request: "create a skill to add new content. make sure it understands the references and sources we
  talked about (but not in a way that the agents creating new content would copy them or reference them). the skill
  may ask what kind of content or if should add more equally for every category etc. and how should be the new file
  size cap. also consider that we may have new minigames in the future"
- Influences: besides Bobobo-bo Bo-bobo and Rick and Morty (from TASK-12), the user picked The Office (US), The Good
  Place, Futurama, The Simpsons and Monty Python to widen the range of humor. `influences.md` groups them by sense of
  humor, never by country, so the list says nothing about who's on the team; `humor.md` carries their moves under
  each style, without the names.
- Tested with a fresh agent that followed the skill for 6 Survey Says questions (accessibility and Formbricks) and
  filled in a writer brief for a request naming a show. The questions passed review and stayed in the pack
  (ss-480 to ss-485), and the brief kept the show's name out. Its friction log led to fixes: full script paths, a
  fallback when the agent can't ask the user, a 40-item line for using writers, writers choosing cuts from topics
  above target, removed items in the review, unambiguous `{{placeholders}}`, the game limits and Bot or Not pair
  guidance in the content guide, the free room in `check.py`, and `changes.py --before` for the before balance.
- The skill's scripts read `PACK_MAX_BYTES` from `packs.ts`, so the two must ship together.
