---
id: TASK-53
title: Make the wow reaction sound different from boo
priority: high
labels: [phase-3, audio]
depends_on: []
created: 2026-10-30
---

## Goal

The "wow" reaction sound is almost the same as "boo", so people can't tell them apart. Give each reaction a sound that
matches what it means.

## Acceptance criteria

- [ ] "Wow" sounds impressed and upbeat; "boo" sounds disapproving; nobody would confuse them.
- [ ] All six reaction sounds are clearly different from each other, checked in /dev/audio.

## Notes

- Part of TASK-3's reaction-sound tuning; can be done with it.
- Measured before the change (rendered offline in /dev/audio): wow and boo were the most alike pair of the six, both
  about 1 s of formant voices on "o"/"u" around 150 to 260 Hz with vibrato.
- Wow is now "w-a-ow!": two voices a major third apart whose vowel glides u → a → o → u (`formantVoice` takes
  `vowels` breakpoints now), pitch climbing from about 225 to 405 Hz and staying up, plus a quiet rising glockenspiel
  sparkle. Boo is a fuller crowd (8 low voices, 140 → 115 Hz, sinking). Spectrogram correlation between them fell to
  0.57, below most other pairs, and their pitch runs in opposite directions an octave apart.
- /dev/audio now draws a print (spectrogram) of every sound: the last one played, and the six reactions side by side.
- Not verified: nobody has listened yet. The criteria are about what people hear, so this stays in progress until
  someone auditions the six reactions in /dev/audio and ticks them.

