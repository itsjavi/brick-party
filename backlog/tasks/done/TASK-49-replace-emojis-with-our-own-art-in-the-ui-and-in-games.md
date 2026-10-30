---
id: TASK-49
title: Replace emojis with our own art, in the UI and in games
priority: high
labels: [phase-3, ui, art]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The game leans on emojis (game icons, power-ups, badges, reactions, awards), which look different on every device and
not like our Toybox style. Replace them with our own icons and art.

## Acceptance criteria

- [x] An icon set in the Toybox style (SVG components or sprites), covering game icons, awards, reactions, in-game
      items and badges (e.g. Doodle Smash power-ups, Brick Brawl's shield, dazed and danger marks).
- [x] No emoji left in the UI or games, except where a player types one themselves.
- [x] Icons drawn on canvases (the fight games) use the same art.
- [x] Checked at laptop and phone size, in light backgrounds and on game colours.

## Notes

- The art lives in one module, `apps/web/app/lib/icons.ts`: 65 icons as SVG paths on a 32×32 grid (flat fills, a
  2.4-unit ink outline, round joins), plus `GAME_ICON` (per game) and `AWARD_ICON` (per award id). `ui/Icon.stsx`
  draws them as inline SVG, 1em square by default so they drop in where emoji sat in text; `drawIcon` draws the same
  paths on a canvas through `Path2D` (power-ups and dizzy stars in Doodle Smash, KO stars in Doodle Champions, move
  hints, badges and falling bricks in Brick Brawl, the paint pot in Paint Grab).
- `emoji` is gone from `GameDefinition` and the awards in `packages/game`: the rules package has no art, and stored
  reports only need award ids. Rules text names power-ups in words instead.
- `/dev/components#icons` shows every icon as SVG and on a canvas, at 16 to 64px, on paper, mist, sky and every game
  colour. Checked there, on the home page, a Brick Brawl test room, the Retro Report and the Doodle Smash sandbox, at
  laptop and phone size.
- `icons.test.ts` fails if a game or award has no icon.
- Left as text: ✓ (a check mark, not an emoji), ▲◀▶▼ on the touch pad, ←↑→↓ on Brick Brawl's arrows, and ♥ in the
  CLI's terminal lines. The reaction protocol keeps its field name `emoji`.

