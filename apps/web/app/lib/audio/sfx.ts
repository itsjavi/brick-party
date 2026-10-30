// Every sound effect is built from three layers where it helps: a transient that reads instantly,
// a body that carries the meaning (rising = good, falling = bad), and a short tail. Tonal cues stay
// in F major pentatonic so they sit with the music; noisy, frequent ones get random pitch jitter.
import { duckMusic, getEngine, isRunning, offlineEngine, voiceCount, type Engine } from "./engine";
import { VOWELS, botNotes, crowdVoices, laughSyllables } from "./formants";
import { midiToFreq, noteToMidi } from "./theory";
import type { SfxName } from "./types";
import { formantVoice, glock, marimba, noise, tone, toy } from "./voices";

/** Identical sounds closer together than this are dropped. */
const THROTTLE = 0.04;
/** Frequent, low-value sounds are skipped when this many voices are already sounding. */
const BUSY = 70;
const FREQUENT: ReadonlySet<SfxName> = new Set(["click", "tick", "chat", "react", "pop", "laser", "slash", "hit"]);

const last = new Map<SfxName, number>();
let tickTock = false;

const jitter = (amount = 0.04) => 1 + (Math.random() * 2 - 1) * amount;
const hz = (note: string) => midiToFreq(noteToMidi(note));
const n = (note: string) => noteToMidi(note);

type Recipe = (e: Engine, t: number, out: AudioNode, verb: AudioNode) => void;

const RECIPES: Record<SfxName, Recipe> = {
  click(e, t, out) {
    const j = jitter();
    tone(e, { type: "triangle", freq: 1900 * j, to: 1250 * j, glide: 0.02, t, dur: 0.035, gain: 0.2, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.012, gain: 0.07, filter: "highpass", freq: 4200, dest: out });
  },

  pop(e, t, out) {
    const j = jitter(0.05);
    tone(e, { freq: 380 * j, to: 980 * j, glide: 0.05, t, dur: 0.09, gain: 0.42, attack: 0.002, dest: out });
    noise(e, { t, dur: 0.02, gain: 0.09, filter: "bandpass", freq: 1800, q: 2, dest: out });
  },

  join(e, t, out, verb) {
    toy(e, out, t, n("F5"), 0.1, 0.8);
    toy(e, out, t + 0.075, n("C6"), 0.2, 0.85);
    tone(e, { type: "triangle", freq: hz("C7"), t: t + 0.075, dur: 0.12, gain: 0.04, dest: verb });
  },

  leave(e, t, out) {
    toy(e, out, t, n("C6"), 0.1, 0.7);
    toy(e, out, t + 0.085, n("F5"), 0.22, 0.65);
  },

  chat(e, t, out) {
    const j = jitter(0.03);
    tone(e, { freq: 720 * j, to: 540 * j, glide: 0.1, t, dur: 0.16, gain: 0.2, attack: 0.008, dest: out });
    tone(e, { freq: 1440 * j, to: 1080 * j, glide: 0.1, t, dur: 0.08, gain: 0.04, attack: 0.005, dest: out });
  },

  tick(e, t, out) {
    tickTock = !tickTock;
    tone(e, { freq: tickTock ? 1500 : 1150, t, dur: 0.05, gain: 0.28, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.012, gain: 0.11, filter: "bandpass", freq: 3000, q: 5, dest: out });
  },

  timeUp(e, t, out) {
    // A friendly buzzer: two slightly detuned squares through a lowpass, then a little "boing".
    const filter = e.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1300;
    filter.connect(out);
    tone(e, { type: "square", freq: 196, t, dur: 0.45, gain: 0.12, attack: 0.01, dest: filter });
    tone(e, { type: "square", freq: 207.6, t, dur: 0.45, gain: 0.1, attack: 0.01, dest: filter });
    tone(e, { type: "triangle", freq: 440, to: 210, glide: 0.25, t: t + 0.42, dur: 0.3, gain: 0.22, dest: out });
  },

  reveal(e, t, out, verb) {
    noise(e, { t, dur: 0.36, gain: 0.22, filter: "bandpass", freq: 500, to: 5200, q: 1.2, attack: 0.16, dest: out });
    ["F6", "A6", "C7", "F7"].forEach((note, i) => glock(e, verb, t + 0.22 + i * 0.055, n(note), 0.4, 0.55));
    ["F6", "A6", "C7", "F7"].forEach((note, i) => glock(e, out, t + 0.22 + i * 0.055, n(note), 0.4, 0.45));
  },

  vote(e, t, out) {
    tone(e, { freq: 165, to: 55, glide: 0.08, t, dur: 0.13, gain: 0.65, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.05, gain: 0.3, filter: "bandpass", freq: 900, q: 1, dest: out });
    noise(e, { t: t + 0.008, dur: 0.015, gain: 0.08, filter: "highpass", freq: 5000, dest: out });
  },

  point(e, t, out, verb) {
    tone(e, { type: "square", freq: hz("A6"), t, dur: 0.06, gain: 0.07, attack: 0.001, dest: out });
    tone(e, { freq: hz("A6"), t, dur: 0.07, gain: 0.18, attack: 0.001, dest: out });
    tone(e, { type: "square", freq: hz("D7"), t: t + 0.055, dur: 0.24, gain: 0.07, attack: 0.001, dest: out });
    tone(e, { freq: hz("D7"), t: t + 0.055, dur: 0.28, gain: 0.2, attack: 0.001, dest: out });
    tone(e, { freq: hz("D8"), t: t + 0.055, dur: 0.12, gain: 0.03, dest: verb });
  },

  win(e, t, out, verb) {
    const run = ["F5", "A5", "C6", "F6"];
    run.forEach((note, i) => {
      toy(e, out, t + i * 0.1, n(note), 0.3, 0.85);
      glock(e, verb, t + i * 0.1, n(note) + 12, 0.3, 0.35);
    });
    const hit = t + 0.42;
    tone(e, { freq: 140, to: 48, glide: 0.1, t: hit, dur: 0.3, gain: 0.6, dest: out });
    noise(e, { t: hit, dur: 0.6, gain: 0.12, filter: "highpass", freq: 6000, dest: verb });
    for (const note of ["F5", "A5", "C6", "F6"]) marimba(e, out, hit, n(note), 1, 0.65);
    glock(e, out, hit, n("A6"), 1, 0.6);
    glock(e, verb, hit + 0.18, n("C7"), 1, 0.5);
    glock(e, verb, hit + 0.3, n("F7"), 1, 0.45);
  },

  lose(e, t, out) {
    // Sad trombone: a sawtooth through a "wah" lowpass, sliding down, the last note wobbling.
    const notes: [string, number, number][] = [
      ["G4", 0, 0.32],
      ["F#4", 0.36, 0.32],
      ["F4", 0.72, 0.32],
      ["E4", 1.08, 0.85],
    ];
    notes.forEach(([note, offset, dur], i) => {
      const start = t + offset;
      const filter = e.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 6;
      filter.frequency.setValueAtTime(380, start);
      filter.frequency.exponentialRampToValueAtTime(1500, start + 0.1);
      filter.frequency.exponentialRampToValueAtTime(520, start + dur);
      filter.connect(out);
      const osc = tone(e, { type: "sawtooth", freq: hz(note), t: start, dur, gain: 0.2, attack: 0.03, dest: filter });
      if (i === notes.length - 1) {
        const lfo = e.ctx.createOscillator();
        const depth = e.ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.value = 7;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(start + 0.15);
        lfo.stop(start + dur);
      }
    });
  },

  whoosh(e, t, out) {
    let dest: AudioNode = out;
    if (typeof e.ctx.createStereoPanner === "function") {
      const panner = e.ctx.createStereoPanner();
      panner.pan.setValueAtTime(-0.6, t);
      panner.pan.linearRampToValueAtTime(0.6, t + 0.32);
      panner.connect(out);
      dest = panner;
    }
    const j = jitter(0.08);
    noise(e, { t, dur: 0.34, gain: 0.28, filter: "bandpass", freq: 300 * j, to: 2900 * j, q: 0.9, attack: 0.14, dest });
  },

  react(e, t, out) {
    const j = jitter(0.08);
    const osc = e.ctx.createOscillator();
    const g = e.ctx.createGain();
    osc.frequency.setValueAtTime(520 * j, t);
    osc.frequency.exponentialRampToValueAtTime(1300 * j, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(940 * j, t + 0.15);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
    tone(e, { type: "triangle", freq: 1040 * j, to: 2600 * j, glide: 0.07, t, dur: 0.1, gain: 0.04, dest: out });
  },

  start(e, t, out, verb) {
    // Riser into a hit, then a glockenspiel answer.
    noise(e, { t, dur: 0.36, gain: 0.18, filter: "bandpass", freq: 400, to: 4200, q: 1, attack: 0.3, dest: out });
    ["C5", "D5", "F5", "G5", "A5", "C6"].forEach((note, i) => marimba(e, out, t + i * 0.055, n(note), 0.3, 0.55));
    const hit = t + 0.38;
    tone(e, { freq: 150, to: 46, glide: 0.11, t: hit, dur: 0.3, gain: 0.8, dest: out });
    for (const offset of [0, 0.011, 0.023]) {
      noise(e, { t: hit + offset, dur: 0.02, gain: 0.25, filter: "bandpass", freq: 1400, q: 0.9, dest: out });
    }
    for (const note of ["F5", "A5", "C6"]) marimba(e, out, hit, n(note), 1, 0.7);
    glock(e, out, hit, n("F6"), 1, 0.55);
    glock(e, verb, hit + 0.16, n("A6"), 1, 0.5);
    glock(e, verb, hit + 0.32, n("C7"), 1, 0.5);
    glock(e, out, hit + 0.48, n("F7"), 1, 0.4);
  },

  heart(e, t, out, verb) {
    glock(e, out, t, n("A6"), 0.6, 0.6);
    glock(e, verb, t + 0.045, n("E7"), 0.6, 0.45);
    for (let i = 0; i < 3; i++) {
      const pitch = n("C7") + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)]! + 12 * Math.floor(Math.random() * 2);
      tone(e, { freq: midiToFreq(pitch), t: t + 0.08 + i * 0.05, dur: 0.12, gain: 0.05, attack: 0.001, dest: verb });
    }
  },

  error(e, t, out) {
    tone(e, { freq: 200, to: 92, glide: 0.12, t, dur: 0.17, gain: 0.5, attack: 0.002, dest: out });
    const filter = e.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    filter.connect(out);
    tone(e, { type: "square", freq: 98, t, dur: 0.12, gain: 0.12, dest: filter });
    tone(e, { type: "triangle", freq: 233, t, dur: 0.1, gain: 0.08, dest: out });
  },

  // --- Reactions: one recognizable sound per reaction button ---

  /** A shove or ram landing: a low punch with a slap on top. */
  thud(e, t, out) {
    const j = jitter(0.06);
    tone(e, { freq: 190 * j, to: 52, glide: 0.09, t, dur: 0.16, gain: 0.7, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.07, gain: 0.35, filter: "lowpass", freq: 1400, dest: out });
    noise(e, { t, dur: 0.02, gain: 0.12, filter: "highpass", freq: 3500, dest: out });
  },

  /** Two bricks bouncing off each other: a short rubbery boing. */
  bump(e, t, out) {
    const j = jitter(0.08);
    tone(e, { type: "triangle", freq: 330 * j, to: 520 * j, glide: 0.05, t, dur: 0.07, gain: 0.3, attack: 0.002, dest: out });
    tone(e, { type: "triangle", freq: 520 * j, to: 260 * j, glide: 0.1, t: t + 0.06, dur: 0.12, gain: 0.22, dest: out });
  },

  /** Off the edge: a cartoon whistle sliding down, then a faraway plop. */
  fall(e, t, out, verb) {
    const j = jitter(0.04);
    tone(e, { freq: 1500 * j, to: 260 * j, glide: 0.7, t, dur: 0.72, gain: 0.16, attack: 0.02, dest: out });
    tone(e, { freq: 1500 * j, to: 260 * j, glide: 0.7, t, dur: 0.72, gain: 0.05, dest: verb });
    tone(e, { freq: 120, to: 60, glide: 0.08, t: t + 0.78, dur: 0.18, gain: 0.35, dest: verb });
    noise(e, { t: t + 0.78, dur: 0.15, gain: 0.1, filter: "lowpass", freq: 600, dest: verb });
  },

  /** A block soaking up a hit: a short metal clang, inharmonic like a struck plate, so it never reads as a ding. */
  shield(e, t, out, verb) {
    const f = 540 * jitter(0.03);
    [1, 2.76, 5.4].forEach((ratio, i) => {
      tone(e, { freq: f * ratio, t, dur: 0.32 - i * 0.08, gain: [0.2, 0.11, 0.05][i]!, attack: 0.001, dest: out });
    });
    tone(e, { freq: f * 1.5, to: f * 1.42, glide: 0.3, t, dur: 0.3, gain: 0.05, dest: verb });
    noise(e, { t, dur: 0.025, gain: 0.22, filter: "bandpass", freq: 3200, q: 1.5, dest: out });
  },

  /** The arena's edge breaking away: a low rumble of falling rubble. */
  crumble(e, t, out) {
    noise(e, { t, dur: 0.9, gain: 0.32, filter: "lowpass", freq: 420, to: 90, attack: 0.05, dest: out });
    for (let i = 0; i < 6; i++) {
      const at = t + 0.05 + i * 0.12 + Math.random() * 0.05;
      tone(e, { freq: 140 + Math.random() * 90, to: 50, glide: 0.06, t: at, dur: 0.09, gain: 0.25, attack: 0.001, dest: out });
    }
  },

  /** A brick dropped from above: a short falling whistle and a clonk. */
  drop(e, t, out) {
    tone(e, { freq: 1900, to: 700, glide: 0.25, t, dur: 0.26, gain: 0.1, dest: out });
    tone(e, { type: "square", freq: 220, to: 90, glide: 0.05, t: t + 0.27, dur: 0.1, gain: 0.18, attack: 0.001, dest: out });
    noise(e, { t: t + 0.27, dur: 0.06, gain: 0.25, filter: "bandpass", freq: 1200, dest: out });
  },

  /** A blaster shot: a "pew", a zap falling in pitch through a lowpass so a volley doesn't hiss. */
  laser(e, t, out) {
    const j = jitter(0.08);
    const soft = e.ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 3200;
    soft.connect(out);
    tone(e, { type: "square", freq: 1500 * j, to: 280 * j, glide: 0.13, t, dur: 0.15, gain: 0.11, attack: 0.001, dest: soft });
    tone(e, { freq: 1500 * j, to: 280 * j, glide: 0.13, t, dur: 0.15, gain: 0.12, attack: 0.001, dest: out });
  },

  /** A swing through the air: a short swoosh of filtered noise sweeping up. */
  slash(e, t, out) {
    const j = jitter(0.1);
    noise(e, { t, dur: 0.16, gain: 0.36, filter: "bandpass", freq: 900 * j, to: 4200 * j, q: 1.6, attack: 0.03, dest: out });
    tone(e, { type: "triangle", freq: 420 * j, to: 900 * j, glide: 0.1, t, dur: 0.1, gain: 0.05, dest: out });
  },

  // --- Fights: Doodle Smash, Doodle Champions and Brick Brawl ---

  /** An ordinary hit landing: a tight smack, a crack of noise on a low knock. Short, so a flurry stays clear. */
  hit(e, t, out) {
    const j = jitter(0.08);
    tone(e, { freq: 220 * j, to: 70, glide: 0.06, t, dur: 0.09, gain: 0.5, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.04, gain: 0.3, filter: "bandpass", freq: 2100 * j, q: 1.3, dest: out });
    noise(e, { t, dur: 0.012, gain: 0.1, filter: "highpass", freq: 5000, dest: out });
  },

  /** A big hit or a critical: a heavy punch with a crunch and a little room, and the music ducks under it. */
  smash(e, t, out, verb) {
    const j = jitter(0.05);
    duckMusic(e, 0.45, 0.2);
    tone(e, { freq: 160 * j, to: 40, glide: 0.14, t, dur: 0.3, gain: 0.7, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.14, gain: 0.4, filter: "lowpass", freq: 3200, to: 380, dest: out });
    noise(e, { t, dur: 0.03, gain: 0.3, filter: "bandpass", freq: 3600, q: 1, dest: out });
    noise(e, { t: t + 0.01, dur: 0.3, gain: 0.12, filter: "bandpass", freq: 1100, q: 0.8, dest: verb });
  },

  /** A knockout: a deep boom, then the ring bell twice. The music drops away for a beat. */
  ko(e, t, out, verb) {
    duckMusic(e, 0.6, 0.7);
    tone(e, { freq: 120, to: 34, glide: 0.4, t, dur: 0.7, gain: 0.72, attack: 0.002, dest: out });
    noise(e, { t, dur: 0.45, gain: 0.3, filter: "lowpass", freq: 1800, to: 120, dest: out });
    noise(e, { t, dur: 0.7, gain: 0.1, filter: "bandpass", freq: 800, q: 0.7, dest: verb });
    for (const at of [0.2, 0.44]) {
      [1, 2.32, 4.25].forEach((ratio, i) => {
        tone(e, { freq: 1180 * ratio, t: t + at, dur: 0.9 - i * 0.25, gain: [0.14, 0.07, 0.035][i]!, attack: 0.001, dest: out });
      });
      tone(e, { freq: 1180, t: t + at, dur: 1.1, gain: 0.05, dest: verb });
    }
  },

  /** Grabbing a power-up: a quick climbing arpeggio, game-style, distinct from the glockenspiel cues. */
  powerUp(e, t, out, verb) {
    ["F5", "A5", "C6", "F6", "A6", "C7"].forEach((note, i) => {
      tone(e, { type: "triangle", freq: hz(note), t: t + i * 0.035, dur: 0.09, gain: 0.3, attack: 0.002, dest: out });
      tone(e, { type: "square", freq: hz(note), t: t + i * 0.035, dur: 0.05, gain: 0.04, attack: 0.002, dest: out });
    });
    tone(e, { type: "triangle", freq: hz("F7"), t: t + 0.21, dur: 0.35, gain: 0.1, dest: verb });
  },

  /** A shield breaking: a glassy burst and a scatter of shards, over a dull knock. */
  shatter(e, t, out, verb) {
    tone(e, { freq: 260, to: 90, glide: 0.15, t, dur: 0.2, gain: 0.4, attack: 0.001, dest: out });
    noise(e, { t, dur: 0.2, gain: 0.22, filter: "bandpass", freq: 3000, q: 0.8, attack: 0.002, dest: out });
    for (let i = 0; i < 7; i++) {
      const at = t + 0.02 + Math.random() * 0.2;
      tone(e, { freq: 1800 + Math.random() * 2200, t: at, dur: 0.1, gain: 0.06, attack: 0.001, dest: i % 2 ? verb : out });
    }
  },

  /** Your attack fully charged: a bright rising zing, so you can let go without looking. */
  charge(e, t, out, verb) {
    tone(e, { type: "triangle", freq: hz("F6"), to: hz("C7"), glide: 0.08, t, dur: 0.2, gain: 0.22, dest: out });
    tone(e, { type: "triangle", freq: hz("F7"), t: t + 0.07, dur: 0.3, gain: 0.08, dest: verb });
  },

  reactLol(e, t, out) {
    // "Ha-ha-ha-ha": a breathy "h" then a vowel "a" per syllable, each falling in pitch.
    for (const s of laughSyllables(4, Math.random)) {
      noise(e, { t: t + s.offset, dur: 0.03, gain: 0.05, filter: "bandpass", freq: 1500, q: 0.7, dest: out });
      formantVoice(e, out, {
        t: t + s.offset + 0.015,
        dur: s.dur,
        vowel: VOWELS.a,
        pitch: [
          [0, s.from],
          [s.dur, s.to],
        ],
        gain: 0.2,
        attack: 0.012,
        release: 0.04,
      });
    }
  },

  reactWow(e, t, out, verb) {
    // An impressed "w-a-ow!": two bright voices a third apart whose mouths open from "w" to "a" and close on "ow",
    // pitch climbing and staying up (boo sinks), with a rising sparkle on top. Shorter and higher than boo.
    const j = jitter(0.03);
    [1, 1.26].forEach((ratio, i) => {
      const f0 = 250 * ratio * j;
      formantVoice(e, i ? verb : out, {
        t: t + i * 0.02,
        dur: 0.62,
        vowel: VOWELS.u,
        vowels: [
          [0.16, VOWELS.a],
          [0.42, VOWELS.o],
          [0.6, VOWELS.u],
        ],
        pitch: [
          [0, f0 * 0.85],
          [0.18, f0 * 1.3],
          [0.62, f0 * 1.42],
        ],
        gain: i ? 0.09 : 0.15,
        attack: 0.04,
        release: 0.16,
        vibrato: { rate: 6.5, depth: 6, delay: 0.25 },
      });
    });
    ["F6", "A6", "C7", "F7"].forEach((note, i) => glock(e, verb, t + 0.12 + i * 0.05, n(note), 0.35, 0.3));
  },

  reactPlus1(e, t, out, verb) {
    marimba(e, out, t, n("C6"), 0.3, 0.7);
    glock(e, out, t, n("C6"), 0.4, 0.45);
    marimba(e, out, t + 0.09, n("F6"), 0.4, 0.8);
    glock(e, out, t + 0.09, n("F6"), 0.6, 0.6);
    glock(e, verb, t + 0.09, n("C7"), 0.6, 0.3);
  },

  reactBoo(e, t, out) {
    // A booing audience: low, staggered, detuned voices on "u", sinking slowly, over a breathy bed.
    for (const v of crowdVoices(8, Math.random)) {
      let dest: AudioNode = out;
      if (typeof e.ctx.createStereoPanner === "function") {
        const panner = e.ctx.createStereoPanner();
        panner.pan.value = v.pan;
        panner.connect(out);
        dest = panner;
      }
      formantVoice(e, dest, {
        t: t + v.delay,
        dur: 1.05,
        vowel: VOWELS.u,
        pitch: [
          [0, v.f0 * 1.04],
          [0.15, v.f0],
          [1.05, v.f0 * (1 - v.drop)],
        ],
        gain: 0.09,
        attack: 0.14,
        release: 0.35,
        vibrato: { rate: 3 + v.drop * 10, depth: 2.5, delay: 0.2 },
        detune: v.detune,
      });
    }
    noise(e, { t, dur: 1.1, gain: 0.05, filter: "bandpass", freq: 420, q: 0.8, attack: 0.15, dest: out });
  },

  reactBot(e, t, out) {
    // Robot bleeps: a quick random square arpeggio, ring-modulated and amplitude-crushed, with the fizz above 4 kHz
    // taken off so it stays cute rather than grating.
    const { ctx } = e;
    const tame = ctx.createBiquadFilter();
    tame.type = "lowpass";
    tame.frequency.value = 4200;
    tame.connect(out);
    const crush = ctx.createWaveShaper();
    crush.curve = stepCurve(6);
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const carrier = ctx.createOscillator();
    carrier.type = "square";
    carrier.frequency.value = 55;
    carrier.connect(ring.gain);
    ring.connect(crush).connect(tame);
    botNotes(6, Math.random).forEach((midi, i) => {
      tone(e, { type: "square", freq: midiToFreq(midi), t: t + i * 0.065, dur: 0.055, gain: 0.16, attack: 0.002, dest: ring });
    });
    carrier.start(t);
    carrier.stop(t + 0.45);
  },

  reactTomato(e, t, out) {
    // Splat: a soft thump, a wet noise burst closing down, then a squelchy wobble and a few drips.
    tone(e, { freq: 190, to: 45, glide: 0.08, t, dur: 0.16, gain: 0.55, attack: 0.002, dest: out });
    noise(e, { t, dur: 0.2, gain: 0.45, filter: "lowpass", freq: 2600, to: 280, q: 1.5, dest: out });
    noise(e, { t: t + 0.06, dur: 0.28, gain: 0.18, filter: "bandpass", freq: 1300, to: 380, q: 6, attack: 0.02, dest: out });
    [0.26, 0.37, 0.5].forEach((offset, i) => {
      const f = (900 - i * 140) * jitter(0.08);
      tone(e, { freq: f, to: f * 0.55, glide: 0.05, t: t + offset, dur: 0.07, gain: 0.07, attack: 0.002, dest: out });
    });
  },
};

/** A staircase transfer curve: quantizes amplitude to a few levels for a lo-fi, bit-crushed edge. */
function stepCurve(levels: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

/** Approximate lengths of the sounds that can pile up, used to cap how many copies overlap. */
const OVERLAP_LENGTH: Partial<Record<SfxName, number>> = {
  hit: 0.1,
  smash: 0.3,
  bump: 0.18,
  thud: 0.16,
  shield: 0.3,
  laser: 0.15,
  slash: 0.16,
  ko: 1.2,
  reactLol: 0.6,
  reactWow: 1,
  reactPlus1: 0.6,
  reactBoo: 1.2,
  reactBot: 0.45,
  reactTomato: 0.6,
};
const MAX_OVERLAP = 3;
const playing = new Map<SfxName, number[]>();

export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

/** Renders one sound effect offline, for looking at it rather than hearing it. */
export function renderSfx(name: SfxName, seconds = 2): Promise<AudioBuffer> {
  const e = offlineEngine(seconds);
  RECIPES[name](e, 0.005, e.sfx, e.sfxVerb);
  return (e.ctx as unknown as OfflineAudioContext).startRendering();
}

export function triggerSfx(name: SfxName) {
  const e = getEngine();
  if (!isRunning(e)) return;
  const now = e.ctx.currentTime;
  const previous = last.get(name);
  if (previous !== undefined && now - previous < THROTTLE) return;
  if (FREQUENT.has(name) && voiceCount() > BUSY) return;
  const length = OVERLAP_LENGTH[name];
  if (length !== undefined) {
    // Many players hitting the same reaction shouldn't stack into noise.
    const ends = (playing.get(name) ?? []).filter((end) => end > now);
    if (ends.length >= MAX_OVERLAP) return;
    ends.push(now + length);
    playing.set(name, ends);
  }
  last.set(name, now);
  RECIPES[name](e, now + 0.005, e.sfx, e.sfxVerb);
}
