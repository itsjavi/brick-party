---
id: TASK-28
title: My Brick: add face and shape options
priority: medium
labels: [phase-1, avatar, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Players can make their brick less alike by picking a face and a shape on top of the color and hat.

## Acceptance criteria

- [x] BrickBuilder (apps/web/app/components/home/BrickBuilder.stsx) has face and shape pickers with a live preview
- [x] Avatar type and its validation in packages/game accept the new fields, with a default for old avatars
- [x] Bricks look right everywhere they show: lobby, player strip, reports, Hall of Fame
- [x] Bots get faces and shapes too

## Notes

Requested by the user: bricks look too similar. Currently an avatar is a color and a hat (AVATAR_COLORS, AVATAR_HATS in packages/game).

Done: `avatarSchema` has `face` (8: classic, blush, glasses, shades, mustache, cyclops, freckles, brows) and `shape` (6:
brick, round, triple, tile, jelly, slim), defaulting to classic and brick, so players saved before parse as they looked.
Match reports keep avatars as stored, so `Brick` takes an `AvatarInput` and defaults missing parts itself. Faces add
features on top of the mood-driven eyes and mouth (shades hide the eyes; cyclops has one). Every shape keeps the
classic height so rows line up; slim is narrower. The CLI personas and the `pnpm play` bots each pick a look.
Checked with headless screenshots: the builder, the lobby, the player strip, the Retro Report and the Hall of Fame
(old players show the classic look). `pnpm e2e` passes.
