---
id: TASK-18
title: Let Claude play bots in local playtests
priority: medium
labels: [phase-1, tooling]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

One person can feel what a real match is like without gathering testers: Claude, in a Claude Code session, plays the
other players. No API key: the decisions come from the session itself. The bots answer, vote, draw, chat and react
like people, but only when they have something to say.

## Acceptance criteria

- [x] `apps/cli` runs a local daemon that joins a room as several bots over the game's WebSocket protocol (no
      browser), and keeps the same bricks between runs.
- [x] It prints one line per moment worth a decision (a new turn, a reveal, a human's chat), for Claude Code's
      Monitor tool to watch.
- [x] `state` summarizes what each bot sees and can do, in a few lines per bot, with player names instead of ids.
- [x] `act` takes a batch of answers, votes, chat lines, reactions and drawings, and sends them with human-like
      delays.
- [x] Drawings can be written as simple shapes, and `look` renders a drawing to a PNG Claude can see.
- [x] An autopilot presses ready and plays a fallback move just before a deadline, so a bot never looks idle.
- [x] A `/playtest` skill starts the bots, gives each a persona, and runs the watch, decide and act loop until the
      match ends.
- [x] Checked by playing a live match against the local dev server.

## Notes

- A bot joins like a browser does: POST the create-player form (keeping the `bp_player` cookie), then read the room
  token from `/r/CODE.data`.
- Claude sees every bot's secrets (the server sends each bot its own view), but never the human's.
- Checked by playing a full custom match (all four games) in a local room with three bots, the host in the browser
  pane: cards and written answers, votes, Bot or Not answers as the Bot, discussion talk, votes by name, Survey Says
  answers by name, Skip Logic writing, shape drawings, `look` and descriptions, hearts, reactions, chat and the final
  report. The autopilot covered every missed deadline, including a whole Survey Says game left to it on purpose.
- Pacing: a decision cycle (read `state`, decide, `act`) takes Claude about 15 to 30 seconds. Answer and drawing phases
  fit easily; 30-second votes are tight, and 9 to 12-second results are mostly too short to react to in time.
  `GAME_PACE=1.5` helps.
- Seen once, not reproduced: in Bot or Not's first round the discussion ended a few seconds in with nobody visibly
  ready; rounds two and three ran their full 90 seconds. Worth watching in the first team playtest (TASK-4).
- The daemon serves `state`, `act` and `look` on 127.0.0.1:7317 (`BRICK_PORT` to change) and records its port in
  `.local/bots/daemon.json`; restarting it mid-match brings the same bricks back.

