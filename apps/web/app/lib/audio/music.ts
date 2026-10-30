// Lookahead sequencer: a setTimeout loop schedules each 16th step slightly ahead on the
// AudioContext clock, so timing stays tight even when the main thread is busy.
import { getEngine, isRunning, musicAudible, voiceCount, type Engine } from "./engine";
import { SONGS, type Instrument, type Part, type Section, type Song } from "./songs";
import {
  degreeToMidi,
  noteToMidi,
  parseChord,
  parseSteps,
  seeded,
  stepSeconds,
  swingDelay,
  voicing,
  type Chord,
  type PatternEvent,
} from "./theory";
import type { MusicMood } from "./types";
import { clap, glock, kick, marimba, pad, pizz, pluck, shaker, sub, toy, wood, type DrumVoice, type PitchedVoice } from "./voices";

const TICK_MS = 25;
const LOOKAHEAD = 0.15;
/** Background tabs throttle timers to ~1 s, so schedule further ahead there. */
const HIDDEN_LOOKAHEAD = 1.5;
const FADE = 0.9;
/** Above this many sounding voices, quiet comping and arpeggios skip notes. */
const DENSE = 56;

const PITCHED: Partial<Record<Instrument, PitchedVoice>> = { marimba, pizz, glock, toy, pluck, sub };
const DRUMS: Partial<Record<Instrument, DrumVoice>> = { kick, clap, shaker, wood };
const HIT_VELOCITY: Record<string, number> = { X: 1, x: 0.75, O: 0.6, o: 0.45 };

interface PreparedPart {
  part: Part;
  /** Melody variants or the one-bar groove, indexed by step. */
  steps: Map<number, PatternEvent>[];
}

interface PreparedSection {
  section: Section;
  chords: Chord[];
  parts: PreparedPart[];
  length: number;
}

interface Prepared {
  song: Song;
  intro: PreparedSection[];
  loop: PreparedSection[];
}

const byStep = (text: string) => new Map(parseSteps(text).events.map((e) => [e.step, e]));

function prepareSection(section: Section): PreparedSection {
  return {
    section,
    chords: section.chords.map(parseChord),
    length: section.chords.length * 16,
    parts: section.parts.map((part) => ({
      part,
      steps:
        part.kind === "melody"
          ? part.variants.map(byStep)
          : part.kind === "groove"
            ? [byStep(part.pattern)]
            : [],
    })),
  };
}

const prepared = new Map<string, Prepared>();
function prepare(song: Song): Prepared {
  let p = prepared.get(song.mood);
  if (!p) {
    p = { song, intro: song.intro.map(prepareSection), loop: song.loop.map(prepareSection) };
    prepared.set(song.mood, p);
  }
  return p;
}

interface Player {
  song: Prepared;
  out: GainNode;
  verb: GainNode;
  channels: Map<Instrument, AudioNode>;
  inIntro: boolean;
  sectionIndex: number;
  step: number;
  pass: number;
  nextTime: number;
  picks: number[];
  stopAt: number | null;
}

let desired: MusicMood = "off";
let current: Player | null = null;
let fading: Player[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function channelFor(e: Engine, player: Player, inst: Instrument): AudioNode {
  const existing = player.channels.get(inst);
  if (existing) return existing;
  const mix = player.song.song.mix[inst] ?? { gain: 0.7, pan: 0, verb: 0.2 };
  const input = e.ctx.createGain();
  input.gain.value = mix.gain;
  if (typeof e.ctx.createStereoPanner === "function") {
    const panner = e.ctx.createStereoPanner();
    panner.pan.value = mix.pan;
    input.connect(panner).connect(player.out);
  } else {
    input.connect(player.out);
  }
  if (mix.verb > 0) {
    const send = e.ctx.createGain();
    send.gain.value = mix.verb;
    input.connect(send).connect(player.verb);
  }
  player.channels.set(inst, input);
  return input;
}

const currentSection = (p: Player) => (p.inIntro ? p.song.intro : p.song.loop)[p.sectionIndex]!;

function pickVariants(p: Player) {
  const section = currentSection(p);
  const rng = seeded(p.pass * 7919 + p.sectionIndex * 104729 + p.song.song.bpm);
  p.picks = section.parts.map((pp) =>
    pp.part.kind === "melody" && p.pass > 0 ? Math.floor(rng() * pp.part.variants.length) : 0,
  );
}

function createPlayer(e: Engine, song: Song, start: number): Player {
  const out = e.ctx.createGain();
  const verb = e.ctx.createGain();
  out.gain.setValueAtTime(0, e.ctx.currentTime);
  out.gain.linearRampToValueAtTime(1, start + FADE);
  verb.gain.setValueAtTime(0, e.ctx.currentTime);
  verb.gain.linearRampToValueAtTime(1, start + FADE);
  out.connect(e.music);
  verb.connect(e.musicVerb);
  const p = prepare(song);
  const player: Player = {
    song: p,
    out,
    verb,
    channels: new Map(),
    inIntro: p.intro.length > 0,
    sectionIndex: 0,
    step: 0,
    pass: 0,
    nextTime: start,
    picks: [],
    stopAt: null,
  };
  pickVariants(player);
  return player;
}

/** Plays every part's notes for the player's current step at time `t`. */
function playStep(e: Engine, p: Player, t: number) {
  const section = currentSection(p);
  const stepSec = stepSeconds(p.song.song.bpm);
  const bar = Math.floor(p.step / 16);
  const inBar = p.step % 16;
  const chord = section.chords[bar]!;
  const dense = voiceCount() > DENSE;

  section.parts.forEach((pp, i) => {
    const { part } = pp;
    const vel = part.vel ?? 1;
    const dest = channelFor(e, p, part.inst);
    switch (part.kind) {
      case "drums": {
        const char = part.pattern[inBar] ?? ".";
        const hit = HIT_VELOCITY[char];
        if (hit) DRUMS[part.inst]?.(e, dest, t, hit * vel, char);
        break;
      }
      case "comp": {
        const hit = HIT_VELOCITY[part.pattern[inBar] ?? "."];
        if (!hit || (dense && vel * hit < 0.6)) break;
        for (const midi of voicing(chord, part.center, 3)) PITCHED[part.inst]?.(e, dest, t, midi, stepSec * 2, hit * vel);
        break;
      }
      case "groove": {
        const ev = pp.steps[0]!.get(inBar);
        if (!ev) break;
        const midi = degreeToMidi(ev.token, chord, part.octave);
        PITCHED[part.inst]?.(e, dest, t, midi, ev.steps * stepSec, (ev.accent ? 1 : 0.85) * vel);
        break;
      }
      case "melody": {
        const ev = pp.steps[p.picks[i] ?? 0]?.get(p.step);
        if (!ev) break;
        PITCHED[part.inst]?.(e, dest, t, noteToMidi(ev.token), ev.steps * stepSec, (ev.accent ? 1 : 0.85) * vel);
        break;
      }
      case "arp": {
        if (p.step % part.rate !== 0 || (dense && vel < 0.6)) break;
        const tones = voicing(chord, part.center, part.span);
        const n = Math.floor(p.step / part.rate);
        const index =
          part.mode === "up"
            ? n % tones.length
            : (() => {
                const period = Math.max(1, tones.length * 2 - 2);
                const k = n % period;
                return k < tones.length ? k : period - k;
              })();
        PITCHED[part.inst]?.(e, dest, t, tones[index]!, stepSec * part.rate, vel);
        break;
      }
      case "pad":
        if (inBar === 0) pad(e, dest, t, voicing(chord, part.center, 3), stepSec * 16, vel);
        break;
    }
  });
}

function advance(p: Player) {
  p.step += 1;
  if (p.step < currentSection(p).length) return;
  p.step = 0;
  p.sectionIndex += 1;
  if (p.inIntro && p.sectionIndex >= p.song.intro.length) {
    p.inIntro = false;
    p.sectionIndex = 0;
  } else if (!p.inIntro && p.sectionIndex >= p.song.loop.length) {
    p.sectionIndex = 0;
    p.pass += 1;
  }
  pickVariants(p);
}

function schedule(e: Engine, p: Player, horizon: number) {
  const stepSec = stepSeconds(p.song.song.bpm);
  // After a suspension (tab sleep, phone call) don't replay the missed steps in a burst.
  if (p.nextTime < e.ctx.currentTime - 0.2) p.nextTime = e.ctx.currentTime + 0.05;
  const audible = musicAudible();
  while (p.nextTime < horizon && (p.stopAt === null || p.nextTime < p.stopAt)) {
    if (audible) playStep(e, p, p.nextTime + swingDelay(p.step, stepSec, p.song.song.swing));
    p.nextTime += stepSec;
    advance(p);
  }
}

function retire(p: Player) {
  p.out.disconnect();
  p.verb.disconnect();
}

function tick() {
  timer = null;
  const e = getEngine();
  if (!e) return;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  const horizon = e.ctx.currentTime + (hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  if (current) schedule(e, current, horizon);
  for (const p of fading) schedule(e, p, horizon);
  const now = e.ctx.currentTime;
  fading = fading.filter((p) => {
    if (p.stopAt !== null && now > p.stopAt + 0.3) {
      retire(p);
      return false;
    }
    return true;
  });
  if (current || fading.length) timer = setTimeout(tick, TICK_MS);
}

/** Starts, switches (crossfading over about a second) or stops the music to match `desired`. */
export function syncMusic() {
  const e = getEngine();
  if (!isRunning(e)) return;
  if (current?.song.song.mood === desired) return;
  const now = e.ctx.currentTime;
  if (current) {
    current.out.gain.cancelScheduledValues(now);
    current.out.gain.setTargetAtTime(0, now, FADE / 3);
    current.verb.gain.cancelScheduledValues(now);
    current.verb.gain.setTargetAtTime(0, now, FADE / 3);
    current.stopAt = now + FADE * 1.6;
    fading.push(current);
    current = null;
  }
  if (desired !== "off") current = createPlayer(e, SONGS[desired], now + 0.06);
  if (!timer) tick();
}

export function setMood(mood: MusicMood) {
  desired = mood;
  syncMusic();
}

export const getMood = () => desired;
