// Pure shapes for the voice-like reaction sounds: vowel formants and the randomized gestures
// (laugh syllables, booing crowd, robot bleeps). The Web Audio side lives in voices.ts / sfx.ts.

export interface Formant {
  /** Centre frequency in Hz. */
  freq: number;
  /** Bandwidth in Hz. */
  bandwidth: number;
  /** Relative level of this formant. */
  gain: number;
}

export type Vowel = "a" | "o" | "u";

/** First three formants of a few sung vowels (adult voice, approximate textbook values). */
export const VOWELS: Record<Vowel, Formant[]> = {
  a: [
    { freq: 800, bandwidth: 80, gain: 1 },
    { freq: 1150, bandwidth: 90, gain: 0.5 },
    { freq: 2900, bandwidth: 120, gain: 0.25 },
  ],
  o: [
    { freq: 450, bandwidth: 70, gain: 1 },
    { freq: 800, bandwidth: 80, gain: 0.32 },
    { freq: 2830, bandwidth: 100, gain: 0.1 },
  ],
  u: [
    { freq: 325, bandwidth: 50, gain: 1 },
    { freq: 700, bandwidth: 60, gain: 0.16 },
    { freq: 2530, bandwidth: 170, gain: 0.05 },
  ],
};

/** Biquad Q for a bandpass with the formant's centre and bandwidth. */
export const formantQ = (f: Formant) => f.freq / f.bandwidth;

export interface Syllable {
  /** Seconds from the start of the sound. */
  offset: number;
  dur: number;
  /** Pitch at the start and end of the syllable, in Hz. */
  from: number;
  to: number;
}

/** "Ha-ha-ha": quick syllables, each falling in pitch, the whole laugh drifting down a little. */
export function laughSyllables(count: number, rng: () => number): Syllable[] {
  const syllables: Syllable[] = [];
  let offset = 0;
  const base = 330 * (0.94 + rng() * 0.12);
  for (let i = 0; i < count; i++) {
    const from = base * (1 - i * 0.05) * (0.97 + rng() * 0.06);
    syllables.push({ offset, dur: 0.085 + rng() * 0.03, from, to: from * 0.82 });
    offset += 0.12 + rng() * 0.025;
  }
  return syllables;
}

export interface CrowdVoice {
  f0: number;
  /** Start delay in seconds, so the crowd doesn't start in unison. */
  delay: number;
  /** Fraction the pitch sinks by the end. */
  drop: number;
  pan: number;
  detune: number;
}

/** A small booing crowd: low voices between 110 and 160 Hz, staggered and detuned. */
export function crowdVoices(count: number, rng: () => number): CrowdVoice[] {
  return Array.from({ length: count }, (_, i) => ({
    f0: 110 + rng() * 50,
    delay: rng() * 0.09,
    drop: 0.1 + rng() * 0.1,
    pan: count > 1 ? -0.6 + (1.2 * i) / (count - 1) : 0,
    detune: (rng() * 2 - 1) * 15,
  }));
}

const BLEEP_SCALE = [0, 2, 4, 7, 9];

/** Robot bleeps: random notes from a pentatonic scale over two octaves above `root`, no immediate repeats. */
export function botNotes(count: number, rng: () => number, root = 84): number[] {
  const notes: number[] = [];
  while (notes.length < count) {
    const note = root + BLEEP_SCALE[Math.floor(rng() * BLEEP_SCALE.length)]! + 12 * Math.floor(rng() * 2);
    if (note !== notes.at(-1)) notes.push(note);
  }
  return notes;
}
