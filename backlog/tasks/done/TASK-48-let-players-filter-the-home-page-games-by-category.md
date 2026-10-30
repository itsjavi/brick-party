---
id: TASK-48
title: Let players filter the home page games by category
priority: high
labels: [phase-3, ui, home]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The home page lists 11 games and growing, so people can narrow it down. A small set of category filters (2 to 4, e.g.
Drawing, Talking, Action, Team) above the game cards shows only the matching games.

## Acceptance criteria

- [x] Each game belongs to one or more categories, defined next to the game (not hard-coded in the page).
- [x] 2 to 4 category filters above the game cards on the home page, plus "All"; picking one shows only its games.
- [x] Works at phone width, and the choice survives a refresh (per-viewer convenience, in localStorage).

## Notes

- Done: four categories in `GAME_CATEGORIES` (words, drawing, action, guessing), set on each game's
  definition (`categories`); a game can be in more than one. The home page shows All plus the four, with counts; the
  choice is kept in localStorage (`brickparty:game-filter`). Checked in the browser, including after a reload.
