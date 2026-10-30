---
id: TASK-21
title: Retro Report: chat messages retrigger the confetti and sound
priority: medium
labels: [phase-1, bug, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

The Retro Report celebrates once, when it appears. Sending or receiving a chat message on that page must not replay the confetti or the win, lose or reveal sound.

## Acceptance criteria

- [x] Confetti and the sound play once per report view, however many chat messages arrive
- [x] A test or a manual check in a room with bots confirms it (chat several messages on the report page)

## Notes

Reported by the user during a playtest. Unverified suspicion: the celebration effect in `apps/web/app/components/room/RetroReport.stsx` lists `report` in its dependencies, so a new `report` object on every room update (a chat message is one) reruns it. Key the effect on a stable value instead, such as the match id, or fire it once with a ref.

Confirmed: every room update sends a new `report` object, and the effect listed it as a dependency. The celebration is
now keyed on the match (`code:endedAt`). Manual check in a room with 3 bots: a MutationObserver counted confetti
canvases while 8 chat messages and a reaction arrived on the report page: none with the fix, one per message without it.
