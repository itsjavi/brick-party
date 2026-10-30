---
id: DECISION-15
title: A Bot or Not Bot is caught only with more votes than anyone else
date: 2026-10-30
tasks: [TASK-24]
---

## Context

In a playtest a 4-player round ended with the Bot on 2 votes and the results said it "got away", which nobody
understood. The rule lived only in `closeVote` (packages/game/src/games/bot-or-not.ts) and no screen stated it. The user
chose to keep the rule and explain it rather than switch to "a tie catches the Bot" or "a majority catches the Bot".

## Decision

- The Bot is caught only when it has strictly more votes than every other player. A tie for the most votes, or more
  votes on someone else, lets the Bot get away with +400.
- Each correct vote still earns +150, caught or not.
- The rules screen says so, and the results screen says why a Bot that got away escaped (a tie, someone else had more
  votes, or nobody suspected it).

## Consequences

- Bots escape more often in small rooms, where ties are common. Revisit after more playtests if detectives feel cheated.
