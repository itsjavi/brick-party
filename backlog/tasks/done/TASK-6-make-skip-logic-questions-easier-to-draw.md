---
id: TASK-6
title: Make Skip Logic questions easier to draw
priority: medium
labels: [phase-2, skip-logic]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The survey questions players draw in Skip Logic are easy to draw: one creature or object doing one visible thing,
somewhere you can picture, not an office idea like a standup, support tickets or a performance review.

## Acceptance criteria

- [x] The hand-written starters that hinge on an office abstraction are rewritten as concrete scenes, keeping their
      ids and spice levels.
- [x] The write step tells players how to keep their question drawable.
- [x] Claude's prompt for new starters steers away from office abstractions too.
- [x] Content tests pass.

## Notes

- Found in a local playtest: "the snowman who answers our support tickets" and "the cat who runs our
  daily standup" were hard to draw, and 13 of the 70 pack starters were built the same way.
- The survey framing ("How satisfied are you...", "Rate...") can't be drawn either, but it's what makes the game
  survey-themed, so it stays; the subject after it carries the drawing.
- Rewrote the 13 starters (sl-008, 012, 015, 017, 023, 025, 030, 032, 044, 052, 060, 067, 070) as one creature or
  object doing one visible thing, avoiding subjects already in the pack (the knight on the phone, the ninja's snack
  drawer, the alien's coffee machine).
- The write step's placeholder was an office abstraction too ("the octopus who does our taxes"); it's now "the octopus
  who serves our coffee", and a hint under the field reads "Keep it drawable: one creature or thing, doing one thing
  you can see. Skip meetings, tickets and reports." Checked in the browser at laptop and phone sizes.
- Claude-written starters weren't checked: there's no API key yet (TASK-2).
