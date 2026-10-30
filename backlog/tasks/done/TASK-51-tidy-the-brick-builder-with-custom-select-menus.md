---
id: TASK-51
title: Tidy the brick builder with custom select menus
priority: high
labels: [phase-3, ui, home]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The first screen and My brick show every colour, hat, face and shape option at once, which looks disorganized. Use a
custom select built on Base UI's React Select, where each option shows what it looks like, so the builder is calm and
compact.

## Acceptance criteria

- [x] A Select component in the Toybox style based on `@base-ui/react`'s Select (or the current name of that
      package), keyboard and screen-reader friendly.
- [x] The brick builder uses it for hat, face and shape (and colour if it reads better), with a preview of each option
      inside the menu.
- [x] The onboarding screen and My brick look uncluttered at laptop and phone width, with the live brick preview kept.
- [x] /dev/components shows the Select.

## Notes

- Done with `@base-ui/react` 1.9.0 (`ui/Select.stsx`): a chunky trigger showing the current choice with its
  little brick, and a menu of tiles with previews. With `name` it renders the hidden input, so the builder's form posts
  `hat`, `face` and `shape` as before (checked: picking Crown on My brick, saving and reloading keeps it).
- Colour stays a row of round swatches (one click beats a menu); hat, face and shape are three selects in a row, one
  per line on phones.
- Keyboard: Base UI's list moves with Up and Down in reading order, so in the tile grid Left and Right do nothing.
- Checked on My brick at laptop and phone width, and in /dev/components. The onboarding screen uses the same
  `BrickBuilder`.
