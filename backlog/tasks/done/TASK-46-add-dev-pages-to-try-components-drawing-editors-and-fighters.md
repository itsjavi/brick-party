---
id: TASK-46
title: Add /dev pages to try components, drawing editors and fighters without a game
priority: medium
labels: [phase-3, dev-tools, drawing]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Developers can try the drawing editors, the fighter animations and the shared UI pieces on their own, without
starting a room or a game. Every page lives under `/dev`, works only on the local dev server (404 on the live site,
like `/dev/audio`), and sends nothing to a server.

## Acceptance criteria

- [x] `/dev` lists every dev page with a one-line description, and every dev page has a nav between them.
- [x] `/dev/draw` has the Skip Logic canvas and the fighter editor (with a Doodle Champions / Doodle Smash stats
      toggle), with Export JSON, Import JSON, a random bot fighter and Clear, and keeps the last drawing in
      localStorage.
- [x] `/dev/fighter` poses a fighter (saved drawing, pasted JSON or random) through every animation, with facing,
      scale, speed and a rig overlay, shows both games' stats, and has a local Doodle Smash sandbox (keyboard fighter,
      optional bots, every stage).
- [x] `/dev/components` shows the shared UI pieces and their variants: bricks, buttons, panels, titles, timers, link
      buttons, audio controls, every game's HUD and rules.
- [x] Every `/dev` loader throws a 404 outside development, and no page imports server-only modules.
- [x] README's "Run it locally" mentions `/dev`.
- [x] `pnpm -s typecheck` and `npx vitest run` pass in `apps/web`.

## Notes

- Built. Pages live in `apps/web/app/components/dev/` with thin route modules `routes/dev*.tsx`; every
  loader throws a 404 unless `import.meta.env.DEV`, like `/dev/audio` (now also in the dev nav).
- Drawings stay in this browser: `brick-dev:sketch` and `brick-dev:fighter` in localStorage, as the strokes the server
  stores (`strokes.ts`). Import takes that JSON, `{ strokes, weapon }`, or `brick shapes` commands.
- `DrawFighter` gained `initialStrokes`, `initialWeapon` and `onChange` so a page can seed and keep a drawing; the games
  don't pass them. It still submits once, so `/dev/draw` restarts it (new `key`) after a test submit.
- Doodle Smash's `SmashSheet` is private to `DoodleSmash.stsx`, so `dev/FighterSheets.stsx` has a copy. Moving it next
  to `StatSheet` in `DrawFighter.stsx` would remove the copy (it touches the live game's screen, so it wasn't done here).
- The Smash sandbox is a thin local driver: `newFight`, `stepFight` and `smashBot` stepped every 50 ms, views built like
  the room's `fightView`, fed to the real `FightClient` and `Arena`; keys go through `useSmashControls` as in a room.
  Options: stage, 0 to 5 bots, bots fight back or stand still, endless lives.
- Checked: typecheck, unit tests, a production build with no STSX warnings, and (in `.local/`) every page
  server-rendered in its loaded state plus 3,000 simulated sandbox ticks per stage. Not yet checked in a browser:
  drawing, the animations, the keyboard sandbox and phone widths.

Verified in the browser: /dev, /dev/draw (both editors, export/import), /dev/fighter (viewer with rig overlay, both stat sheets, the offline Smash sandbox fighting a bot) and /dev/components.
