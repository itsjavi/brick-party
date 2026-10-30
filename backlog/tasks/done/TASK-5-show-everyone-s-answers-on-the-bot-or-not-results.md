---
id: TASK-5
title: Show everyone's answers on the Bot or Not results
priority: medium
labels: [phase-2, bot-or-not]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The round's reveal shows what everyone answered, so the table can laugh at how the Bot's answer fit its decoy
question. Until now the results showed both questions, the votes and the points, but not a single answer.

## Acceptance criteria

- [x] Bot or Not's results show every player's answer, with the Bot's answer marked as the Bot's.
- [x] Players who didn't answer still show up, as silent.
- [x] The screen still fits a laptop and stays playable on a phone.

## Notes

- Found in a local playtest: the results never showed "inflation", the escaped Bot's answer to "the
  scariest word in a horror movie title".
- The server already sends `answers` in the results view (`view.answers` is set in every phase after `answer`), so
  this is a UI change in `apps/web/app/components/games/BotOrNot.stsx`.
- Not part of this task: whether the Bot should know it's the Bot (an Undercover-style variant). The user kept the
  current design for now.
- Done by reusing the discussion's answer cards on the results screen. A first version added them as an extra row,
  which pushed "Who got accused" and "Points this round" below the fold at 1280x800 when the Bot was caught. Those two
  panels are now folded into the cards: each card shows the answer, who accused that player and the points they
  scored, and the Bot's card is tagged and shares the decoy question's yellow.
- Checked in the browser with three players: an escaped Bot, a caught Bot with a correct guess, and a
  round where nobody answered, at 1280x800 and at 375x812.
