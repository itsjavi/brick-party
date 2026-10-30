// Brick Party's soundtrack, written in step notation (see theory.ts `parseSteps`): 16 steps per bar.
// Sonic identity: a toy box. Marimba, glockenspiel and toy piano over plucky bass and soft
// kick/clap/shaker; home key F major, the tension cue in its relative D minor. All melodies are original.
import type { MusicMood } from "./types";

export type Instrument = "marimba" | "pizz" | "glock" | "toy" | "pluck" | "sub" | "pad" | "kick" | "clap" | "shaker" | "wood";

export type Part =
  /** A melody across the whole section; one variant is picked per pass ("" = tacet). */
  | { kind: "melody"; inst: Instrument; variants: string[]; vel?: number }
  /** One bar of drum characters, repeated: X/x/O/o hits (decreasing velocity), "." rest. */
  | { kind: "drums"; inst: Instrument; pattern: string; vel?: number }
  /** One bar of chord-relative degree tokens, repeated, following the chord of each bar. */
  | { kind: "groove"; inst: Instrument; pattern: string; octave: number; vel?: number }
  /** One bar of chord stabs, repeated: X/x/o hits voiced around `center`. */
  | { kind: "comp"; inst: Instrument; pattern: string; center: number; vel?: number }
  /** Chord tones from `center` upward, one every `rate` steps. */
  | { kind: "arp"; inst: Instrument; rate: number; center: number; span: number; mode: "up" | "updown"; vel?: number }
  /** The bar's chord held for the whole bar. */
  | { kind: "pad"; inst: "pad"; center: number; vel?: number };

export interface Section {
  name: string;
  /** One chord per bar. */
  chords: string[];
  parts: Part[];
}

export interface Channel {
  gain: number;
  pan: number;
  /** Reverb send. */
  verb: number;
}

export interface Song {
  mood: Exclude<MusicMood, "off">;
  bpm: number;
  swing: number;
  /** Sections played once before the loop starts. */
  intro: Section[];
  loop: Section[];
  mix: Partial<Record<Instrument, Channel>>;
}

const bars = (...lines: string[]) => lines.join(" | ");
const rest = ". . . . . . . . . . . . . . . .";

// ---------------------------------------------------------------- lobby
// F major, 112 BPM, light swing. Intro → A → A2 → B → break, looping from A. Melodies vary per pass.

const lobbyA1 = bars(
  "C5 . F5 . A5 . . G5 F5 . A5 . C6 . . .",
  "D6 . . C6 A5 . F5 . D5 . F5 . A5 . . .",
  "Bb5 . . A5 G5 . F5 . D5 . F5 . G5 . . .",
  "E5 . G5 . C6 . . . Bb5 . A5 . G5 . . .",
  "C5 . F5 . A5 . . G5 F5 . A5 . C6 . D6 .",
  "F6 . . E6 D6 . A5 . F5 . A5 . D6 . . .",
  "D6 . C6 . Bb5 . A5 . G5 . A5 . Bb5 . G5 .",
  "E5 . . . G5 . . . C6 . . . . . . .",
);

const lobbyA1Sparse = bars(
  ". . . . A5 . C6 . . . A5 . F5 . . .",
  ". . . . F5 . A5 . . . D6 . . . . .",
  ". . . . D5 . F5 . . . Bb5 . A5 . G5 .",
  "E5 . . . . . . . . . . . . . . .",
  ". . . . C6 . A5 . . . C6 . F6 . . .",
  ". . . . D6 . A5 . . . F5 . A5 . . .",
  ". . . . Bb5 . D6 . . . C6 . Bb5 . A5 .",
  "G5 . . . E5 . . . C5 . . . . . . .",
);

const lobbyA2 = bars(
  ". . F5 A5 C6 . A5 . C6 . D6 . C6 . A5 .",
  ". . F5 A5 D6 . A5 . F6 . E6 . D6 . . .",
  ". . D5 F5 Bb5 . A5 . G5 . F5 . G5 . A5 .",
  "G5 . . . E5 . . . C5 . D5 . E5 . G5 .",
  ". . F5 A5 C6 . A5 . C6 . F6 . E6 . C6 .",
  ". . D6 . F6 . E6 . D6 . A5 . F5 . A5 .",
  "Bb5 . A5 . G5 . F5 . G5 . A5 . Bb5 . D6 .",
  "C6 . . . . . . . G5 . E5 . D5 . C5 .",
);

const lobbyB = bars(
  "D6 . . . F6 . D6 . Bb5 . . . C6 . D6 .",
  "E6 . . . G6 . E6 . C6 . . . D6 . E6 .",
  "C6 . . . E6 . C6 . A5 . . . G5 . A5 .",
  "F5 . A5 . D6 . . . . . . . . . . .",
  "Bb5 . . . D6 . Bb5 . G5 . . . A5 . Bb5 .",
  "C6 . . . E6 . G6 . F6 . E6 . D6 . C6 .",
  "A5 . C6 . F6 . . . . . . . E6 . D6 .",
  "C6 . Bb5 . G5 . E5 . C5 . D5 . E5 . G5 .",
);

const bounceBass = "1 . . 1 . . 5 . 8 . . 5 . . 3 .";
const offbeats = "..x...x...x...x.";
const lightShaker = "x.o.x.o.x.o.x.o.";

const lobby: Song = {
  mood: "lobby",
  bpm: 112,
  swing: 0.14,
  intro: [
    {
      name: "intro",
      chords: ["F", "Dm", "Bb", "C"],
      parts: [
        { kind: "comp", inst: "marimba", pattern: offbeats, center: 69, vel: 0.7 },
        { kind: "drums", inst: "shaker", pattern: "..o...o...o...o.", vel: 0.8 },
      ],
    },
  ],
  loop: [
    {
      name: "A",
      chords: ["F", "Dm", "Bb", "C", "F", "Dm", "Bb", "C"],
      parts: [
        { kind: "comp", inst: "marimba", pattern: offbeats, center: 69, vel: 0.7 },
        { kind: "groove", inst: "pluck", pattern: bounceBass, octave: 2 },
        { kind: "drums", inst: "kick", pattern: "X.......x.......", vel: 0.8 },
        { kind: "drums", inst: "shaker", pattern: lightShaker },
        { kind: "melody", inst: "toy", variants: [lobbyA1, lobbyA1, lobbyA1Sparse, ""] },
      ],
    },
    {
      name: "A2",
      chords: ["F", "Dm", "Bb", "C", "F", "Dm", "Bb", "C"],
      parts: [
        { kind: "comp", inst: "marimba", pattern: offbeats, center: 69, vel: 0.7 },
        { kind: "groove", inst: "pluck", pattern: bounceBass, octave: 2 },
        { kind: "drums", inst: "kick", pattern: "X.......x.......", vel: 0.8 },
        { kind: "drums", inst: "clap", pattern: "....x.......x...", vel: 0.7 },
        { kind: "drums", inst: "shaker", pattern: lightShaker },
        { kind: "melody", inst: "toy", variants: [lobbyA2, lobbyA2, lobbyA1] },
      ],
    },
    {
      name: "B",
      chords: ["Bb", "C", "Am", "Dm", "Gm", "C", "F", "C7"],
      parts: [
        { kind: "comp", inst: "marimba", pattern: "x..x..x...x..x..", center: 67, vel: 0.65 },
        { kind: "groove", inst: "pluck", pattern: "1 . . 1 . . 1 . 5 . . 5 . . 8 .", octave: 2 },
        { kind: "drums", inst: "kick", pattern: "X.......x.....x.", vel: 0.8 },
        { kind: "drums", inst: "clap", pattern: "....x.......x...", vel: 0.7 },
        { kind: "drums", inst: "shaker", pattern: "xox.xox.xox.xoxo" },
        { kind: "melody", inst: "glock", variants: [lobbyB] },
        { kind: "arp", inst: "toy", rate: 4, center: 77, span: 4, mode: "up", vel: 0.35 },
      ],
    },
    {
      name: "break",
      chords: ["F", "Bb", "F", "C"],
      parts: [
        { kind: "arp", inst: "marimba", rate: 2, center: 65, span: 6, mode: "updown", vel: 0.6 },
        { kind: "groove", inst: "pluck", pattern: "1 . . . . . . . . . . . . . . .", octave: 2, vel: 0.8 },
        { kind: "drums", inst: "shaker", pattern: "..o...o...o...o.", vel: 0.7 },
      ],
    },
  ],
  mix: {
    marimba: { gain: 0.8, pan: -0.25, verb: 0.25 },
    toy: { gain: 0.9, pan: 0.15, verb: 0.3 },
    glock: { gain: 0.9, pan: 0.2, verb: 0.4 },
    pluck: { gain: 0.9, pan: 0, verb: 0.05 },
    kick: { gain: 0.8, pan: 0, verb: 0 },
    clap: { gain: 0.55, pan: 0.05, verb: 0.2 },
    shaker: { gain: 0.6, pan: 0.35, verb: 0.1 },
  },
};

// ---------------------------------------------------------------- think
// F major, 92 BPM. Tick-tock woodblock, a low marimba ostinato and a sparse celesta motif, so
// people can read and type.

const thinkMotif = bars(
  ". . . . . . . . A5 . C6 . . . . .",
  rest,
  ". . . . . . . . C6 . E6 . . . . .",
  rest,
  ". . . . . . . . D6 . F6 . . . . .",
  rest,
  ". . . . . . . . E6 . D6 . C6 . . .",
  rest,
);

const thinkMotif2 = bars(
  ". . . . . . . . F5 . A5 . D6 . . .",
  rest,
  ". . . . . . . . D6 . C6 . Bb5 . . .",
  rest,
  ". . . . . . . . A5 . C6 . F6 . . .",
  rest,
  ". . . . . . . . G5 . E5 . C5 . . .",
  rest,
);

const ostinato = "1 . 5 . 8 . 5 . 3 . 5 . 8 . 5 .";

const think: Song = {
  mood: "think",
  bpm: 92,
  swing: 0.08,
  intro: [],
  loop: [
    {
      name: "T1",
      chords: ["F", "F", "Am", "Am", "Bb", "Bb", "C", "C"],
      parts: [
        { kind: "drums", inst: "wood", pattern: "x...o...x...o...", vel: 0.55 },
        { kind: "groove", inst: "marimba", pattern: ostinato, octave: 4, vel: 0.5 },
        { kind: "groove", inst: "pluck", pattern: "1 . . . . . . . 5 . . . . . . .", octave: 2, vel: 0.75 },
        { kind: "melody", inst: "toy", variants: [thinkMotif, thinkMotif, ""], vel: 0.7 },
      ],
    },
    {
      name: "T2",
      chords: ["Dm", "Dm", "Bb", "Bb", "F", "F", "C", "C"],
      parts: [
        { kind: "drums", inst: "wood", pattern: "x...o...x...o...", vel: 0.55 },
        { kind: "groove", inst: "marimba", pattern: ostinato, octave: 4, vel: 0.5 },
        { kind: "groove", inst: "pluck", pattern: "1 . . . . . . . 5 . . . . . . .", octave: 2, vel: 0.75 },
        { kind: "drums", inst: "shaker", pattern: "....o.......o...", vel: 0.6 },
        { kind: "melody", inst: "glock", variants: [thinkMotif2, "", thinkMotif2], vel: 0.6 },
      ],
    },
  ],
  mix: {
    wood: { gain: 0.5, pan: 0.3, verb: 0.1 },
    marimba: { gain: 0.75, pan: -0.2, verb: 0.25 },
    pluck: { gain: 0.75, pan: 0, verb: 0.05 },
    toy: { gain: 0.8, pan: 0.2, verb: 0.35 },
    glock: { gain: 0.7, pan: 0.25, verb: 0.45 },
    shaker: { gain: 0.45, pan: 0.4, verb: 0.1 },
  },
};

// ---------------------------------------------------------------- tension
// D minor, 104 BPM, straight. Heartbeat kick, pulsing sub, a creeping staccato line with a
// chromatic neighbour, and a tritone sting before the loop comes round.

const sneak = bars(
  "D5 . E5 . F5 . E5 . D5 . . . C#5 . D5 .",
  ". . . . A4 . . . . . . . . . . .",
  "D5 . E5 . F5 . G5 . F5 . . . E5 . D5 .",
  ". . . . Bb4 . . . . . . . . . . .",
  "G5 . F5 . E5 . D5 . E5 . . . F5 . G5 .",
  ". . . . Bb4 . . . . . . . . . . .",
  "A5 . G5 . F5 . E5 . C#5 . . . E5 . A4 .",
  ". . . . . . . . G5 . . . C#5 . . .",
);

const pings = bars(
  ". . . . . . A5 . . . . . . . F6 .",
  ". . . . . . F5 . . . . . . . D6 .",
  ". . . . . . G5 . . . . . . . Bb5 .",
  ". . . . . . E5 . . . . . . . C#6 .",
  ". . . . . . A5 . . . . . . . F6 .",
  ". . . . . . F5 . . . . . . . D6 .",
  ". . . . . . G5 . . . . . . . Bb5 .",
  ". . . . . . E5 . . . . . . . C#6 .",
);

const tension: Song = {
  mood: "tension",
  bpm: 104,
  swing: 0,
  intro: [],
  loop: [
    {
      name: "S1",
      chords: ["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A7", "A7"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X..o............", vel: 0.85 },
        { kind: "groove", inst: "sub", pattern: "1 . 1 . 1 . 1 . 1 . 1 . 1 . 1 .", octave: 2, vel: 0.7 },
        { kind: "drums", inst: "wood", pattern: "x.x.x.x.x.x.x.x.", vel: 0.25 },
        { kind: "pad", inst: "pad", center: 57, vel: 0.8 },
        { kind: "melody", inst: "pizz", variants: [sneak] },
      ],
    },
    {
      name: "S2",
      chords: ["Dm", "Bb", "Gm", "A7", "Dm", "Bb", "Gm", "A7"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X..o....X..o....", vel: 0.85 },
        { kind: "groove", inst: "sub", pattern: "1 . 1 . 1 . 1 . 1 . 1 . 1 . 1 .", octave: 2, vel: 0.7 },
        { kind: "drums", inst: "wood", pattern: "x.x.x.x.x.x.x.xx", vel: 0.28 },
        { kind: "groove", inst: "pizz", pattern: "1 . . 5 . . 8 . . 5 . . 3 . . .", octave: 4, vel: 0.7 },
        { kind: "pad", inst: "pad", center: 57, vel: 0.8 },
        { kind: "melody", inst: "glock", variants: [pings, pings, ""], vel: 0.55 },
      ],
    },
  ],
  mix: {
    kick: { gain: 0.8, pan: 0, verb: 0 },
    sub: { gain: 0.8, pan: 0, verb: 0 },
    wood: { gain: 0.5, pan: -0.35, verb: 0.15 },
    pad: { gain: 0.7, pan: 0, verb: 0.4 },
    pizz: { gain: 0.85, pan: 0.15, verb: 0.2 },
    glock: { gain: 0.6, pan: 0.35, verb: 0.6 },
  },
};

// ---------------------------------------------------------------- reveal
// F major, 120 BPM. A short, bouncy 8-bar loop for answers being revealed.

const reveal: Song = {
  mood: "reveal",
  bpm: 120,
  swing: 0.1,
  intro: [],
  loop: [
    {
      name: "R",
      chords: ["F", "Bb", "Gm", "C", "F", "Bb", "C", "F"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X.......x.......", vel: 0.8 },
        { kind: "drums", inst: "clap", pattern: "....x.......x...", vel: 0.7 },
        { kind: "drums", inst: "shaker", pattern: lightShaker },
        { kind: "comp", inst: "marimba", pattern: "x.x...x.x.x...x.", center: 69, vel: 0.6 },
        { kind: "groove", inst: "pluck", pattern: bounceBass, octave: 2 },
        { kind: "arp", inst: "glock", rate: 2, center: 77, span: 6, mode: "up", vel: 0.45 },
      ],
    },
  ],
  mix: {
    kick: { gain: 0.8, pan: 0, verb: 0 },
    clap: { gain: 0.55, pan: 0, verb: 0.2 },
    shaker: { gain: 0.55, pan: 0.35, verb: 0.1 },
    marimba: { gain: 0.75, pan: -0.25, verb: 0.25 },
    pluck: { gain: 0.9, pan: 0, verb: 0.05 },
    glock: { gain: 0.65, pan: 0.3, verb: 0.45 },
  },
};

// ---------------------------------------------------------------- results
// F major, 124 BPM, four on the floor. A glockenspiel fanfare, then the bVI–bVII–I victory cadence.

const fanfare = bars(
  "F5 . A5 . C6 . F6 . . . C6 . F6 . . .",
  "E6 . D6 . A5 . D6 . . . . . F5 . . .",
  "D6 . C6 . Bb5 . D6 . . . F6 . D6 . . .",
  "C6 . . . E6 . . . G6 . . . . . . .",
  "F5 . A5 . C6 . F6 . . . A6 . G6 . F6 .",
  "E6 . D6 . . . A5 . D6 . E6 . F6 . . .",
  "G6 . F6 . D6 . Bb5 . C6 . D6 . E6 . . .",
  "F6 . . . . . . . E6 . . . G6 . . .",
);

const victory = bars(
  "F5 . . . Ab5 . . . Db6 . . . C6 . Ab5 .",
  "G5 . . . Bb5 . . . Eb6 . . . D6 . Bb5 .",
  "A5 . C6 . F6 . . . . . . . . . . .",
  ". . . . A6 . G6 . F6 . E6 . F6 . . .",
  "F6 . Db6 . Ab5 . Db6 . F6 . . . Ab6 . . .",
  "G6 . Eb6 . Bb5 . Eb6 . G6 . . . Bb6 . . .",
  "A6 . . . . . . . F6 . . . C6 . . .",
  "E6 . D6 . C6 . Bb5 . A5 . G5 . E5 . C5 .",
);

const results: Song = {
  mood: "results",
  bpm: 124,
  swing: 0,
  intro: [],
  loop: [
    {
      name: "fanfare",
      chords: ["F", "Dm", "Bb", "C", "F", "Dm", "Bb", "C"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X...x...X...x...", vel: 0.85 },
        { kind: "drums", inst: "clap", pattern: "....x.......x...", vel: 0.75 },
        { kind: "drums", inst: "shaker", pattern: "x.x.x.x.x.x.x.x." },
        { kind: "groove", inst: "pluck", pattern: "1 . 8 . 1 . 8 . 1 . 8 . 1 . 8 .", octave: 2 },
        { kind: "comp", inst: "marimba", pattern: offbeats, center: 69, vel: 0.65 },
        { kind: "melody", inst: "glock", variants: [fanfare] },
      ],
    },
    {
      name: "victory",
      chords: ["Db", "Eb", "F", "F", "Db", "Eb", "F", "C"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X...x...X...x...", vel: 0.85 },
        { kind: "drums", inst: "clap", pattern: "....x.......x..x", vel: 0.75 },
        { kind: "drums", inst: "shaker", pattern: "xoxoxoxoxoxoxoxo" },
        { kind: "groove", inst: "pluck", pattern: "1 . 8 . 1 . 8 . 1 . 8 . 5 . 8 .", octave: 2 },
        { kind: "comp", inst: "marimba", pattern: "x..x..x...x..x..", center: 68, vel: 0.65 },
        { kind: "melody", inst: "toy", variants: [victory] },
      ],
    },
  ],
  mix: {
    kick: { gain: 0.85, pan: 0, verb: 0 },
    clap: { gain: 0.55, pan: 0, verb: 0.2 },
    shaker: { gain: 0.5, pan: 0.35, verb: 0.1 },
    pluck: { gain: 0.9, pan: 0, verb: 0.05 },
    marimba: { gain: 0.7, pan: -0.25, verb: 0.25 },
    glock: { gain: 0.85, pan: 0.2, verb: 0.4 },
    toy: { gain: 0.9, pan: 0.2, verb: 0.35 },
  },
};

// ---------------------------------------------------------------- battle
// D minor, 132 BPM, straight: the fights. Four on the floor and a driving octave bass under a marimba riff, a toy-piano
// hook, then an 8-bar breakdown (half-time kick, pizzicato, sparse pings) so a 3-minute fight gets room to breathe.
// No sustained high notes, and the riff changes every pass.

const riff = bars(
  "D5 . D5 . F5 . D5 . A5 . . G5 F5 . E5 .",
  "D5 . D5 . F5 . D5 . C6 . . A5 G5 . F5 .",
  "D5 . D5 . F5 . D5 . Bb5 . . A5 F5 . D5 .",
  "C5 . E5 . G5 . C6 . . . G5 . E5 . G5 .",
  "D5 . D5 . F5 . D5 . A5 . . G5 F5 . E5 .",
  "D5 . D5 . F5 . D5 . D6 . . C6 A5 . F5 .",
  "Bb5 . A5 . G5 . F5 . G5 . . A5 Bb5 . D6 .",
  "C#6 . . . A5 . . . E5 . . . C#5 . E5 .",
);

const riffSparse = bars(
  "D5 . . . . . A5 . . . D6 . . . . .",
  "F5 . . . . . A5 . . . C6 . . . . .",
  "D5 . . . . . F5 . . . Bb5 . . . . .",
  "E5 . . . . . G5 . . . C6 . . . . .",
  "D5 . . . . . A5 . . . D6 . . . . .",
  "F5 . . . . . A5 . . . D6 . C6 . A5 .",
  "Bb5 . . . D6 . . . G5 . . . Bb5 . . .",
  "A5 . . . C#6 . . . E6 . . . A5 . . .",
);

const hook = bars(
  "F5 . F5 . G5 . A5 . . . F5 . D5 . . .",
  "E5 . E5 . G5 . C6 . . . A5 . G5 . . .",
  "A5 . . . D6 . . . C6 . A5 . F5 . . .",
  "A5 . G5 . F5 . E5 . D5 . . . . . . .",
  "F5 . F5 . G5 . A5 . . . Bb5 . D6 . . .",
  "C6 . C6 . E6 . G6 . . . E6 . C6 . . .",
  "C#6 . . . E6 . . . A6 . . . G6 . E6 .",
  "C#6 . . . . . . . A5 . . . . . . .",
);

const breakPings = bars(
  ". . . . D6 . . . . . . . Bb5 . . .",
  ". . . . G5 . . . . . . . D6 . . .",
  ". . . . F5 . . . . . . . D6 . . .",
  ". . . . Bb5 . . . . . . . F5 . . .",
  ". . . . D6 . . . . . . . Bb5 . . .",
  ". . . . G5 . . . . . . . D6 . . .",
  ". . . . E5 . . . . . . . C#6 . . .",
  ". . . . A5 . . . E5 . . . C#6 . . .",
);

const battle: Song = {
  mood: "battle",
  bpm: 132,
  swing: 0,
  intro: [],
  loop: [
    {
      name: "drive",
      chords: ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Bb", "A"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X...x...X...x...", vel: 0.85 },
        { kind: "drums", inst: "clap", pattern: "....x.......x...", vel: 0.7 },
        { kind: "drums", inst: "shaker", pattern: lightShaker, vel: 0.8 },
        { kind: "groove", inst: "pluck", pattern: "1 . 1 8 . 1 . 1 1 . 1 8 . 1 5 .", octave: 2 },
        { kind: "melody", inst: "marimba", variants: [riff, riff, riffSparse] },
      ],
    },
    {
      name: "hook",
      chords: ["Bb", "C", "Dm", "Dm", "Bb", "C", "A", "A"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X...x...X...x...", vel: 0.85 },
        { kind: "drums", inst: "clap", pattern: "....x.......x..x", vel: 0.7 },
        { kind: "drums", inst: "shaker", pattern: lightShaker, vel: 0.8 },
        { kind: "groove", inst: "pluck", pattern: "1 . 8 . 1 . 8 . 1 . 8 . 1 5 8 .", octave: 2 },
        { kind: "comp", inst: "marimba", pattern: offbeats, center: 64, vel: 0.55 },
        { kind: "melody", inst: "toy", variants: [hook, hook, ""] },
      ],
    },
    {
      name: "breakdown",
      chords: ["Gm", "Gm", "Bb", "Bb", "Gm", "Gm", "A", "A"],
      parts: [
        { kind: "drums", inst: "kick", pattern: "X.......X.......", vel: 0.8 },
        { kind: "drums", inst: "wood", pattern: "....x.......x..x", vel: 0.3 },
        { kind: "groove", inst: "sub", pattern: "1 . . . 1 . . . 1 . . . 1 . 1 .", octave: 2, vel: 0.7 },
        { kind: "groove", inst: "pizz", pattern: "1 . 5 . 8 . 5 . 1 . 5 . 8 . 5 .", octave: 4, vel: 0.65 },
        { kind: "melody", inst: "glock", variants: [breakPings, ""], vel: 0.45 },
      ],
    },
  ],
  mix: {
    kick: { gain: 0.85, pan: 0, verb: 0 },
    clap: { gain: 0.5, pan: 0, verb: 0.2 },
    shaker: { gain: 0.4, pan: 0.35, verb: 0.1 },
    pluck: { gain: 0.9, pan: 0, verb: 0.05 },
    marimba: { gain: 0.75, pan: -0.2, verb: 0.2 },
    toy: { gain: 0.8, pan: 0.2, verb: 0.3 },
    sub: { gain: 0.75, pan: 0, verb: 0 },
    wood: { gain: 0.45, pan: -0.35, verb: 0.15 },
    pizz: { gain: 0.8, pan: 0.15, verb: 0.2 },
    glock: { gain: 0.5, pan: 0.3, verb: 0.5 },
  },
};

export const SONGS: Record<Exclude<MusicMood, "off">, Song> = { lobby, think, tension, battle, reveal, results };
