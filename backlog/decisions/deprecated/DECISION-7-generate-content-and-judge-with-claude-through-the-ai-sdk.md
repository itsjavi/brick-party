---
id: DECISION-7
title: Generate content and judge with Claude through the AI SDK
date: 2026-10-30
tasks: []
replaced_by: DECISION-12
---

## Context

The user wanted Claude, through the AI SDK, to write content (Cards Against Humanity-style prompts for Worst Feedback
Ever, question pairs for Bot or Not) since the team has credits, with hand-written packs as well.

## Decision

`packages/content` calls Claude through the AI SDK library (`ai`, made by Vercel but not tied to its hosting) and
`@ai-sdk/anthropic`. Content mixes Claude's cards with
the hand-written packs. Content uses `CONTENT_MODEL` (default `claude-opus-5-5`); judging uses `JUDGE_MODEL` (default
`claude-haiku-5-5`). Every call has a fallback: the packs for content, keyword matching for judging.

## Consequences

- The game works without an API key, using only the packs.
- No sampling parameters are sent, and refusal fallbacks are only sent to models that support them.
