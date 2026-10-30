---
id: TASK-52
title: Make battle sounds and music sound good
priority: high
labels: [phase-3, audio]
depends_on: []
created: 2026-10-30
---

## Goal

The fight games' sounds and music (Doodle Smash, Doodle Champions, Brick Brawl) sound bad. Rework them so fights feel
punchy and fun.

## Acceptance criteria

- [ ] New or reworked hit, swing, laser, shield, fall, KO, power-up, crumble and drop sounds that are satisfying and
      clearly different from each other.
- [ ] Battle music that fits a fight: driving, not grating, and not tiring over a 3-minute fight.
- [ ] Mixed so effects and music don't drown each other, and frequent sounds don't stack into noise.
- [ ] Auditioned in /dev/audio and in a real fight before calling it done.

## Notes

- Sounds and music are procedural (`apps/web/app/lib/audio`). TASK-3 (tune reactions and music by ear) overlaps; do
  them together if it helps.
- Built and measured without ears. Fights used to play the brick "bump" boing for every hit, the UI "pop"
  for power-ups, the whistle "fall" for a KO and the slow "tension" mood.
- New sounds in `sfx.ts`: `hit` (a tight smack), `smash` (big hits and crits), `ko` (a boom and the ring bell
  twice), `powerUp` (a quick game-style arpeggio, unlike the glockenspiel cues), `shatter` (a broken shield),
  `charge` (pings once when your Doodle Smash attack is fully charged). `shield` is now an inharmonic metal clang
  instead of a glockenspiel ding that sat next to +1. `laser` is a lowpassed "pew": its brightness centre was about
  6 kHz. Doodle Smash and Doodle Champions use them; Brick Brawl keeps its brick sounds (bump, thud, fall, crumble).
- Mix: hits, swings, shots, blocks and KOs are capped at three overlapping copies, `hit` is skipped when the voice
  count is high, and `smash` and `ko` duck the music (a new `duck` bus between the music and the master) for a
  moment. Measured loudness (peak RMS, offline): hit 0.22, smash 0.40, ko 0.47, shatter 0.23, shield 0.14,
  powerUp 0.14, charge 0.10, laser 0.06, slash 0.04.
- New `battle` mood (D minor, 132 BPM): four on the floor, an octave bass, a marimba riff with three variants, a
  toy-piano hook, then an 8-bar half-time breakdown; 24 bars, about 44 s a pass. Doodle Smash and Doodle
  Champions play it in the fight phase, Brick Brawl for the whole game.
- Checked: every new sound renders in /dev/audio and has a print there, the battle mood starts there, and a Doodle
  Smash sandbox fight ran with them and no console errors (muted).
- Not verified: nobody has listened. Before ticking anything, someone should play each fight sound in /dev/audio and
  a full fight of each game with sound on.

