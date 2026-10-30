---
id: TASK-14
title: Filter offensive nicknames and chat
priority: low
labels: [phase-1, security]
depends_on: []
created: 2026-10-30
---

## Goal

The site is public (DECISION-11), so anyone can pick an offensive nickname or post offensive chat. Everyone in the
room sees both, and nicknames also end up in Retro Reports and the Hall of Fame. Obvious slurs and abuse should be
blocked before anyone sees them.

## Acceptance criteria

- [ ] Nicknames are checked against a word list when a brick is created or renamed; a blocked one gets a friendly
      error.
- [ ] Chat messages are checked too; blocked words are masked or the message is dropped (see Notes).
- [ ] The check sees through case, spacing, repeated letters and common letter swaps (0 for o, 3 for e, and so on).
- [ ] Tests cover blocked words, the tricks above, and ordinary words that contain a blocked word (the "Scunthorpe"
      problem).

## Notes

On hold: the user decided not to filter anything yet, and that game write-ins stay unfiltered even if
chat and nicknames are filtered later. The open questions below remain for when this comes back:

- Block or mask chat? Masking keeps the conversation going; dropping is simpler.
- Which languages? Players come from many countries, so English only may miss a lot.
- Should game write-ins be filtered too (Worst Feedback answers, Bot or Not answers and guesses, Skip Logic texts)?
  They show on the shared screen like chat does.
- Where to get the list: a maintained open-source list, or a short hand-written one.

Today: nicknames are at most 20 characters (`nicknameSchema` in `packages/game/src/types.ts`), chat messages at most
280 (`clientMessageSchema` in `packages/game/src/protocol.ts`). The host can kick a player, and the open-rooms list no
longer shows nicknames.
