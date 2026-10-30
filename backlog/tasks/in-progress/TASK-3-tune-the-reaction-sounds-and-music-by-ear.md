---
id: TASK-3
title: Tune the reaction sounds and music by ear
priority: medium
labels: [phase-1, audio]
depends_on: []
created: 2026-10-30
---

## Goal

Every sound is recognizable and pleasant over a 30 to 60 minute session. Nobody has listened to them yet: they're
synthesized in code (`apps/web/app/lib/audio/`).

## Acceptance criteria

- [ ] Each reaction sounds like its label: LOL a laugh, WOW an "ooh", +1 a ding, BOO a real crowd boo, BOT robot
      bleeps, tomato a splat.
- [ ] The five music moods (lobby, think, tension, reveal, results) don't get annoying over a long session.
- [ ] Anything that doesn't work is adjusted in `apps/web/app/lib/audio/`.

## Notes

- Audition everything at `/dev/audio` while the dev server runs.
- Done without ears (by measurement in /dev/audio's sound prints): wow reworked so it can't pass for boo
  (TASK-53), boo made a fuller 8-voice crowd, and the robot bleeps lowpassed at 4.2 kHz: their brightness centre was
  near 8 kHz, by far the harshest of the six, now about 2.9 kHz. LOL, +1 and tomato measured distinct and weren't
  changed.
- Music, measured: lobby loops every 60 s (4/3/1 melody variants per section), think 42 s (3/3), tension 37 s (1/3),
  reveal 16 s (no melody), results 31 s (1/1). Results is the most likely to wear thin on a long Retro Report.
- Still needs a person: listen to every reaction and each mood for a few minutes, then tick the criteria or note what
  grates.

