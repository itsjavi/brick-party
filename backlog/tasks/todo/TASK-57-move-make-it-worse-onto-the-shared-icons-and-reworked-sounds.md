---
id: TASK-57
title: Move Make It Worse onto the shared icons and reworked sounds
priority: low
labels: [phase-3, new-game]
depends_on: [TASK-49, TASK-52, TASK-53]
created: 2026-10-30
---

## Goal

Make It Worse (TASK-44) was built on its own branch while the polish tasks reworked icons and sounds on main. Once main
is merged in, bring the game in line with DECISION-23 and the new sounds, so it looks and sounds like the other games.

## Acceptance criteria

- [x] The game's `emoji` and its five awards' `emoji` fields are gone, and the game and awards (`dark-lord-of-ux`,
      `escape-artist`, `read-the-fine-print`, `most-sued`, `premium-member`) have icons in `GAME_ICON` and `AWARD_ICON`
      in `apps/web/app/lib/icons.ts`.
- [x] The trap icons in `games/worse/TrapIcon.stsx` move into `lib/icons.ts` and render through `ui/Icon.stsx`, with the
      same art.
- [ ] The game's sounds use whatever TASK-52 and TASK-53 changed (names, new effects), checked by ear with sound on.
- [ ] Typecheck, tests (including `icons.test.ts`) and a "Test it" round pass.

## Notes

- Icons done when main was merged into the Make It Worse branch: the game's mark is `worseForm`, the traps map
  through `TRAP_ICON`, and the new awards use `worseForm`, `runaway`, `magnifier`, plus new `gavel` and `card` art.
  `games/worse/TrapIcon.stsx` is gone.
- Left: the sounds, once TASK-52 and TASK-53 are done. The game only uses existing effect names (pop, whoosh, bump,
  error, thud, start, reveal, lose, drop, point, click), which still typecheck after the merge.
