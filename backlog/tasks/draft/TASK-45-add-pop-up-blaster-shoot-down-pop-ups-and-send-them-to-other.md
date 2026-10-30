---
id: TASK-45
title: Add Pop-up Blaster, shoot down pop-ups and send them to other players
priority: low
labels: [phase-3, new-game]
depends_on: [TASK-48, TASK-49, TASK-50, TASK-51, TASK-52, TASK-53]
created: 2026-10-30
---

## Goal

A real-time arcade game about the web's worst pop-ups. Cookie banners, newsletter modals, chat widgets and "Rate us!"
dialogs fall onto your screen and pile up; click their close buttons before the pile reaches the top. Like Tetris 99,
every pop-up you close lands on another player's screen, so it's a fight rather than solo games side by side.
Accessible patterns are the power-ups. No words.

## Acceptance criteria

- [ ] Pop-ups fall and stack on each player's screen; closing one sends it to another player. A full screen knocks you
      out; last player standing, or the shortest pile at the time limit, wins.
- [ ] Tricky pop-ups: fake close buttons that spawn two more, close buttons that dodge the cursor, "Are you sure?"
      chains, and "Unsaved work" dialogs that cost points if you destroy them.
- [ ] Power-ups based on accessible patterns: Esc clears every properly built modal, Reduce motion freezes everything
      for a few seconds, High contrast shows which close buttons are real.
- [ ] Fair on phones: small close buttons get a generous tap area, so the challenge is being fooled, not precise taps.
- [ ] Each screen runs on its own from a shared seed and only attacks and knockouts go through the server, inside the
      room's message limits (DECISION-11).
- [ ] Bots close a few pop-ups a second and sometimes miss: moves in `packages/game/src/bots.ts`, `state` lines in
      `apps/cli/src/moves.ts`, and play notes in `.claude/agents/playtest-driver.md`.
- [ ] Plays to the end in a "Test it" room, pauses cleanly, and gets through a `/playtest` match with bots.
- [ ] A "How to play" screen, awards, sounds, and tests for the rules.

## Notes

- Comes after Make It Worse (TASK-44) and can reuse its trap components, such as the runaway button and the modal loop.
- With Paint Grab and Doodle Smash it would be the third live game; check the playlist still has enough calm games.
- Waits for the high-priority polish tasks (TASK-48 to TASK-53): the user asked for them before any new game.
