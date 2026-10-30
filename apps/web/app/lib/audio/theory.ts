// Pure music helpers: note names, chords, step patterns and scheduler timing. No Web Audio here,
// so everything in this file is unit-tested.

const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" → 60, "Bb5" → 82, "F#3" → 54. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name: ${name}`);
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PITCH_CLASSES[m[1]!]! + accidental;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface Chord {
  /** MIDI note of the root in octave 3 (F → 53). */
  root: number;
  /** Semitones above the root, root first. */
  intervals: number[];
}

const QUALITIES: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
};

/** "F", "Dm", "Bb", "C7", "A7", "Db", "Ebmaj7" → root and intervals. */
export function parseChord(name: string): Chord {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  const intervals = m ? QUALITIES[m[3]!] : undefined;
  if (!m || !intervals) throw new Error(`Bad chord: ${name}`);
  return { root: noteToMidi(`${m[1]}${m[2] ?? ""}3`), intervals };
}

/** Chord tones closest to `center`, `count` of them, ascending (a close voicing). */
export function voicing(chord: Chord, center: number, count = 3): number[] {
  const candidates: number[] = [];
  for (let octave = -3; octave <= 4; octave++) {
    for (const i of chord.intervals) candidates.push(chord.root + i + octave * 12);
  }
  return candidates
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b);
}

const MAJOR_DEGREES: Record<string, number> = { "1": 0, "2": 2, "3": 4, "4": 5, "5": 7, "6": 9, "7": 11, "8": 12, "9": 14 };

/**
 * A chord-relative degree token ("1", "5", "8", "b7", "3'", "5,") → MIDI note, given the chord and
 * the octave its root sits in. 3, 5 and 7 follow the chord's quality unless altered with b/#.
 */
export function degreeToMidi(token: string, chord: Chord, octave: number): number {
  const m = /^(b|#)?([1-9])('*)(,*)$/.exec(token);
  if (!m) throw new Error(`Bad degree: ${token}`);
  const degree = m[2]!;
  let semis = MAJOR_DEGREES[degree]!;
  if (m[1] === "b") semis -= 1;
  else if (m[1] === "#") semis += 1;
  else if (degree === "3") semis = chord.intervals[1] ?? 4;
  else if (degree === "5") semis = chord.intervals[2] ?? 7;
  else if (degree === "7") semis = chord.intervals[3] ?? 10;
  const rootInOctave = (chord.root % 12) + 12 * (octave + 1);
  return rootInOctave + semis + 12 * m[3]!.length - 12 * m[4]!.length;
}

export interface PatternEvent {
  step: number;
  /** A note name or a chord-relative degree, depending on the pattern. */
  token: string;
  steps: number;
  accent: boolean;
}

/**
 * Step notation: one whitespace-separated token per 16th step. "." is a rest, "-" holds the previous
 * note one more step, a trailing "!" accents a note, and "|" is a visual bar line that counts as nothing.
 */
export function parseSteps(text: string): { events: PatternEvent[]; length: number } {
  const tokens = text.split(/\s+/).filter((t) => t && t !== "|");
  const events: PatternEvent[] = [];
  tokens.forEach((raw, step) => {
    if (raw === ".") return;
    if (raw === "-") {
      const last = events.at(-1);
      if (last && last.step + last.steps === step) last.steps += 1;
      return;
    }
    const accent = raw.endsWith("!");
    events.push({ step, token: accent ? raw.slice(0, -1) : raw, steps: 1, accent });
  });
  return { events, length: tokens.length };
}

/** Seconds per step. 16th notes by default. */
export function stepSeconds(bpm: number, stepsPerBeat = 4): number {
  return 60 / bpm / stepsPerBeat;
}

/** Swing delays every odd 16th by a fraction of a step. */
export function swingDelay(step: number, stepSec: number, swing: number): number {
  return step % 2 === 1 ? swing * stepSec : 0;
}

/** Linear 0..1 slider → gain, on a curve that feels even to the ear (−48 dB at the bottom, silent at 0). */
export function sliderToGain(value: number): number {
  if (value <= 0) return 0;
  const clamped = Math.min(1, value);
  return 10 ** ((clamped - 1) * 2.4);
}

/** Deterministic PRNG (mulberry32) for musical variation, so a pass of a song is reproducible. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
