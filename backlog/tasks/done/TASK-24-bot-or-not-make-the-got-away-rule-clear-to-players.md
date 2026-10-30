---
id: TASK-24
title: Bot or Not: make the 'got away' rule clear to players
priority: medium
labels: [phase-1, bot-or-not, ux]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

Players can tell how a Bot gets caught or gets away in Bot or Not.

## Acceptance criteria

- [x] Decide the catch rule from the game code and write it down (a decision if it constrains the game)
- [x] The rules screen and the results screen state it in plain words

## Notes

Found in a playtest: in a 4-player round the Bot got 2 votes and the results said they 'got away'. Open question: what threshold counts as caught (a majority of the voters, or the most votes with no tie)? Read packages/game/src/games/ for Bot or Not before deciding.

The user chose to keep the current rule and explain it: DECISION-15. The 4-player case was a 2-2 tie. The rules card,
the vote instructions and the results line now say it; the results line also says why a Bot got away (a tie, someone
else had more votes, or nobody suspected it). Test: "a tie for the most votes lets the Bot get away" in games.test.ts.
Checked in the browser with 3 bots: a 2-2 tie showed "Tied for the most votes, and a tie lets the Bot escape. +400 for
the Bot."
