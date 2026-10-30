---
id: TASK-2
title: Check Claude content and judging with a real API key
priority: high
labels: [phase-1, ai]
depends_on: []
created: 2026-10-30
---

## Goal

Claude's prompts and judging work for real, not only their fallbacks, which are all that local testing has covered
so far (there was no API key).

## Acceptance criteria

- [ ] With `ANTHROPIC_API_KEY` set, each game gets Claude-written content (`ai-` cards appear in the `prompt_cards`
      table) and it reads well at both spice levels.
- [ ] A caught Bot's guess in Bot or Not gets Claude's verdict and quip.
- [ ] Skip Logic's reveal shows "Claude's verdict", with sensible closeness scores and drift.
- [ ] Removing the key again falls back to the packs and the keyword judge without errors.

## Notes

- Locally the key goes in `apps/web/.dev.vars`; restart the dev server after changing it.
- Models: `CONTENT_MODEL` (default `claude-opus-5-5`) and `JUDGE_MODEL` (default `claude-haiku-5-5`) in
  `apps/web/wrangler.jsonc`.
- Content generation must finish before the first game starts; if it's often slow, note how long it takes here.
