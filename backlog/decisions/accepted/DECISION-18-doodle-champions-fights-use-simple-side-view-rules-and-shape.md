---
id: DECISION-18
title: Doodle Champions fights use simple side-view rules and shape-only stats
date: 2026-10-30
tasks: [TASK-35]
---

## Context

In Doodle Champions, players draw fighters part by part and then watch them fight, and how a fighter moves comes from
what was drawn. Fights could be simple rules or a physics simulation of the drawn parts, seen from the side or from
above. Every screen must show the same fight, and the server decides who wins.

## Decision

- Fights are seen from the side. Fighters move along a 2D floor by simple rules for stepping, jumping, hitting and
  knockback, with numbers set by their stats. The drawn parts are animated on top of that movement.
- No physics simulation of the drawn parts.
- Stats come from the shapes of the drawing alone. Colours are only for looks.

## Consequences

- Fights are easy to make identical on the server and every screen, and easy to balance and test.
- Fighters wobble and flop less than real physics would make them. The fun has to come from the animation of the drawn
  parts and the stats they give.
- Players don't need to learn what colours mean, but colour gives no strategy.
