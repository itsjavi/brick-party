---
name: playtest
description: Play Brick Party with the user on the local dev server, with you playing the other players as bots. Use when the user wants to playtest, play a match with bots, or have you join their room.
---

# Playtest

The user plays in their browser; bots play everyone else. Each bot is a teammate with a persona who answers, votes,
draws, chats and reacts, so the match feels like a real one. You set the playtest up; the `playtest-driver` agent
plays the bots (`.claude/agents/playtest-driver.md`). It runs on a small context, so a match costs a fraction of
playing it from this session. No API key is involved: the decisions are Claude's.

Arguments, both optional: a room code and a bot count, as in `/playtest CZFX 4`. Three bots by default.

## Start

1. The dev server must answer at http://localhost:5173. If it doesn't, start it with the Browser pane's
   `preview_start` (`dev`).
2. Without a room code, ask the user to create a room in their browser; `start` without a code joins the next lobby
   that opens.
3. Run `rm -f .local/bots/events.log`, then start the bots with Bash in the background:
   `pnpm -s brick start [CODE] --bots N`.
4. Wait for them with Bash in the background:
   `until grep -q '^\[ready\]' .local/bots/events.log 2>/dev/null; do sleep 1; done`.
5. Launch the `playtest-driver` agent in the background with the prompt "Play the bots in the running playtest."
6. Tell the user the bots are in, that they host and start the match, and that they can talk to the bots in the game
   chat.

## While it runs

The driver finishes in three cases, and its final message says which:

- **The host pressed play again**: launch a fresh driver at once, with the same prompt. A fresh one keeps its context
  small.
- **The user ended it, or nobody played on**: go to End.
- **The bots stopped**: go to End.

Keep the driver's playtest notes from every run. While a driver is running, leave the bots to it: this session sends
no `act` calls of its own.

## End

When the user is done, run `pnpm -s brick stop` if the bots are still in, and stop any running driver. This is a
playtest, so the notes are the product: tell the user what felt off along the way (pacing, unclear rules, bugs,
deadlines the bots kept missing), merging the drivers' notes with your own, and offer to record the real issues as
backlog tasks. If phases were too short for the bots, suggest `GAME_PACE=1.5` in `apps/web/.dev.vars`.
