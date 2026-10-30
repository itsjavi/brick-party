---
id: DECISION-6
title: Identify players by nickname and recovery key
date: 2026-10-30
tasks: []
---

## Context

The user wanted a nickname that's remembered across sessions, and a key to restore it in other browsers, instead of
accounts.

## Decision

Players pick a nickname, brick color and hat. They get a recovery key formatted `BRIK-XXXX-XXXX-XXXX`; only its
SHA-256 hash is stored, and the key restores the same player anywhere. A signed cookie remembers the player in each
browser.

## Consequences

- No passwords, email or sign-in providers.
- Anyone with the key can play as that player, and losing both the browser data and the key means starting over.
- Nicknames don't have to be unique.
