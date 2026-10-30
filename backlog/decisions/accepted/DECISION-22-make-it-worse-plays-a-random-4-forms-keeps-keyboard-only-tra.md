---
id: DECISION-22
title: Make It Worse plays a random 4 forms, keeps keyboard-only traps, and uses a hand-written survey pack
date: 2026-10-30
tasks: [TASK-44]
---

## Context

TASK-44 left three questions open before building Make It Worse: what happens to traps whose trick needs a keyboard or
hover on phones, where the base surveys come from, and how long the game runs in a big room when every player's form
is played. The user answered all three.

## Decision

- Traps whose trick needs a keyboard or hover (runaway button, modal loop, Tab order maze, slider, terms box) stay in
  the palette as they are, with no touch trick and no phone check. Phone players just have a harder time.
- The base surveys come from a hand-written content pack of 6 to 8 short surveys, written with the `add-content`
  skill. Each match picks one.
- Everyone builds a form, but only 4 forms, drawn at random, are played. The forms that aren't played show up in a
  short gallery in the reveal, so nobody's work is lost. Rooms with 4 players or fewer play every form.

## Consequences

- This replaces the last consequence of DECISION-20: keyboard-only traps don't need a touch trick and aren't hidden
  from phone players. The rest of DECISION-20 stands.
- A round lasts about the same in a room of 5 as in a room of 12.
- Content work: the survey pack is written before the game can be played.
