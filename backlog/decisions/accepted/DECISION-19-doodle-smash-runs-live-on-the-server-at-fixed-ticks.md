---
id: DECISION-19
title: Doodle Smash runs live on the server at fixed ticks
date: 2026-10-30
tasks: [TASK-43]
---

## Context

Every other game moves forward on player actions and phase deadlines; Brick Brawl was made turn-based so network delay
across countries wouldn't matter. The user asked for a Smash Bros-style variant of Doodle Champions that players control
live, as a separate game that reuses its drawing step, with Smash-style damage % and ring-outs (3 lives) and a
Blaster/Blade weapon toggle chosen while drawing.

## Decision

- Doodle Smash is a separate game. Fights run live: the room ticks the fight at a fixed rate in memory while the game
  is fighting (not through storage alarms), the server is the authority, and clients send key changes, not positions.
- Clients move their own fighter at once and smooth everyone else; heavy data (the drawings) is sent once, not in
  every fight update.
- Shield is B or Shift, not Cmd.

## Consequences

- Players with high network delay see others slightly behind and land hits a little late; acceptable for a party game.
- The room does more work during fights, so tick rate, view size and broadcast rate must stay inside the free plan.
- Bots need live control (a per-tick AI) rather than one move per phase.
