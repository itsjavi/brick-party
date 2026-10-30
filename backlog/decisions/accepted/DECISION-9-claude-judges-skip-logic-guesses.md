---
id: DECISION-9
title: Claude judges Skip Logic guesses
date: 2026-10-30
tasks: []
---

## Context

In Skip Logic nobody judged how close a guess was; only hearts scored. The user asked for Claude to judge.

## Decision

After the last step Claude scores every guess 0 to 10 against the question that was drawn: +150 for 8 or more,
+75 for 5 to 7, for both the guesser and the artist. It rates each chain's drift and writes a one-line verdict, and the
most-drifted chain's owner gets "Lost in Translation". Hearts still score.

## Consequences

- If Claude doesn't answer within 20 seconds, keyword matching judges instead, and the verdict says "The judge's
  verdict" rather than claiming Claude made it.
- Drawings themselves aren't judged; the artist's bonus comes from the guess.
