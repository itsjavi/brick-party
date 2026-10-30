---
id: DECISION-23
title: Icons are our own Toybox art in one module, never emoji
date: 2026-10-30
tasks: [TASK-49]
---

## Context

Emoji look different on every device and nothing like the Toybox style (DECISION-5). The fight games draw on a canvas
(DECISION-21), so their icons can't be SVG elements.

## Decision

Every icon on screen is our own art from `apps/web/app/lib/icons.ts`: SVG paths on a 32×32 grid, flat fills and a thick
ink outline. React screens use `ui/Icon.stsx`; canvases use `drawIcon` with the same paths. Game and award icons are
mapped there by id; the rules package carries no art.

## Consequences

- A new game or award needs an icon in `GAME_ICON` or `AWARD_ICON` (typecheck and `icons.test.ts` catch a missing one).
- No emoji in UI text, rules or canvases, except what players type.
