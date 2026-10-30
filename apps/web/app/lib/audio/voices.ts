// Synth building blocks and the toy-box instrument family: marimba, glockenspiel, toy piano,
// plucky bass, soft drums. Every voice schedules nodes at an absolute AudioContext time.
import { trackVoice, type Engine } from "./engine";
import { formantQ, type Formant } from "./formants";
import { midiToFreq } from "./theory";

const FLOOR = 0.0001;

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Glide target frequency, reached after `glide` seconds. */
  to?: number;
  glide?: number;
  t: number;
  /** Time until the envelope reaches silence. */
  dur: number;
  gain: number;
  attack?: number;
  detune?: number;
  dest: AudioNode;
}

/** One oscillator with an attack/exponential-decay envelope. */
export function tone(e: Engine, o: ToneOpts): OscillatorNode {
  const { ctx } = e;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, o.t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.t + (o.glide ?? o.dur));
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const attack = o.attack ?? 0.003;
  g.gain.setValueAtTime(0, o.t);
  g.gain.linearRampToValueAtTime(o.gain, o.t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, o.t + Math.max(o.dur, attack + 0.01));
  osc.connect(g).connect(o.dest);
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.03);
  trackVoice(osc);
  return osc;
}

interface NoiseOpts {
  t: number;
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  attack?: number;
  dest: AudioNode;
}

/** A filtered slice of the shared noise buffer. */
export function noise(e: Engine, o: NoiseOpts) {
  const { ctx } = e;
  const src = ctx.createBufferSource();
  src.buffer = e.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.setValueAtTime(o.freq, o.t);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, o.t + o.dur);
  filter.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const attack = o.attack ?? 0.002;
  g.gain.setValueAtTime(0, o.t);
  g.gain.linearRampToValueAtTime(o.gain, o.t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, o.t + Math.max(o.dur, attack + 0.01));
  src.connect(filter).connect(g).connect(o.dest);
  src.start(o.t, Math.random() * 0.5);
  src.stop(o.t + o.dur + 0.03);
  trackVoice(src);
}

// --- Pitched instruments: (engine, destination, time, midi, duration in seconds, velocity 0..1) ---

export type PitchedVoice = (e: Engine, dest: AudioNode, t: number, midi: number, dur: number, vel: number) => void;

/** Wooden bar: fundamental plus the bright 4th partial that makes the mallet "tock". Low notes ring longer. */
export const marimba: PitchedVoice = (e, dest, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  const ring = Math.min(1.1, Math.max(0.28, 1.5 - (midi - 48) * 0.025));
  tone(e, { freq: f, t, dur: ring, gain: 0.42 * vel, attack: 0.002, dest });
  tone(e, { freq: f * 4, t, dur: 0.07, gain: 0.1 * vel, attack: 0.001, dest });
  tone(e, { type: "triangle", freq: f * 2, t, dur: ring * 0.35, gain: 0.05 * vel, dest });
};

/** Short, dry marimba for sneaky staccato lines. */
export const pizz: PitchedVoice = (e, dest, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  tone(e, { freq: f, t, dur: 0.2, gain: 0.4 * vel, attack: 0.002, dest });
  tone(e, { freq: f * 4, t, dur: 0.04, gain: 0.08 * vel, attack: 0.001, dest });
};

/** Glockenspiel: inharmonic metal partials (1, 2.76, 5.4) with a long shimmer on the fundamental. */
export const glock: PitchedVoice = (e, dest, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  tone(e, { freq: f, t, dur: 1.0, gain: 0.22 * vel, attack: 0.001, dest });
  tone(e, { freq: f * 2.76, t, dur: 0.32, gain: 0.07 * vel, attack: 0.001, dest });
  tone(e, { freq: f * 5.4, t, dur: 0.1, gain: 0.03 * vel, attack: 0.001, dest });
};

/** Toy piano: a struck tine, round body with a tiny metallic tick on top. */
export const toy: PitchedVoice = (e, dest, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  tone(e, { freq: f, t, dur: 0.75, gain: 0.3 * vel, attack: 0.002, dest });
  tone(e, { type: "triangle", freq: f * 2, t, dur: 0.25, gain: 0.07 * vel, dest });
  tone(e, { freq: f * 7.1, t, dur: 0.04, gain: 0.025 * vel, attack: 0.001, dest });
};

/** Plucky bass: square + triangle through a resonant lowpass that snaps shut. */
export const pluck: PitchedVoice = (e, dest, t, midi, dur, vel) => {
  const { ctx } = e;
  const f = midiToFreq(midi);
  const len = Math.min(0.5, Math.max(0.16, dur));
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(1700, t);
  filter.frequency.exponentialRampToValueAtTime(240, t + 0.16);
  filter.connect(dest);
  tone(e, { type: "square", freq: f, t, dur: len, gain: 0.13 * vel, attack: 0.004, dest: filter });
  tone(e, { type: "triangle", freq: f, t, dur: len, gain: 0.32 * vel, attack: 0.004, dest: filter });
};

/** Round, pulsing sub for the tension mood. */
export const sub: PitchedVoice = (e, dest, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  tone(e, { freq: f, t, dur: 0.24, gain: 0.48 * vel, attack: 0.006, dest });
  tone(e, { type: "triangle", freq: f * 2, t, dur: 0.12, gain: 0.07 * vel, attack: 0.004, dest });
};

/** Soft, slow pad: detuned triangle pairs under one lowpass, held for the bar. */
export function pad(e: Engine, dest: AudioNode, t: number, midis: number[], dur: number, vel: number) {
  const { ctx } = e;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 850;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + Math.min(0.5, dur * 0.4));
  g.gain.setValueAtTime(vel, t + dur * 0.75);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.25);
  filter.connect(g).connect(dest);
  for (const midi of midis) {
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midiToFreq(midi);
      osc.detune.value = detune;
      const level = ctx.createGain();
      level.gain.value = 0.05;
      osc.connect(level).connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.3);
      trackVoice(osc);
    }
  }
}

interface FormantVoiceOpts {
  t: number;
  dur: number;
  vowel: Formant[];
  /** Later vowels as [seconds from start, formants], glided to from the one before: "w-a-o-w". */
  vowels?: [number, Formant[]][];
  /** Pitch breakpoints as [seconds from start, Hz]; the first one is the starting pitch. */
  pitch: [number, number][];
  gain: number;
  attack?: number;
  release?: number;
  vibrato?: { rate: number; depth: number; delay: number };
  detune?: number;
  type?: OscillatorType;
}

/** A buzzy source shaped by parallel vowel formant filters: a cartoon human voice. */
export function formantVoice(e: Engine, dest: AudioNode, o: FormantVoiceOpts) {
  const { ctx } = e;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sawtooth";
  const [first, ...rest] = o.pitch;
  osc.frequency.setValueAtTime(first![1], o.t + first![0]);
  for (const [at, hz] of rest) osc.frequency.exponentialRampToValueAtTime(hz, o.t + at);
  if (o.detune) osc.detune.value = o.detune;
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.setValueAtTime(0, o.t);
    depth.gain.linearRampToValueAtTime(o.vibrato.depth, o.t + o.vibrato.delay + 0.1);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(o.t);
    lfo.stop(o.t + o.dur + 0.05);
  }

  const attack = o.attack ?? 0.01;
  const release = Math.min(o.release ?? 0.08, o.dur * 0.6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, o.t);
  env.gain.linearRampToValueAtTime(o.gain, o.t + attack);
  env.gain.setValueAtTime(o.gain, o.t + o.dur - release);
  env.gain.exponentialRampToValueAtTime(FLOOR, o.t + o.dur);
  env.connect(dest);

  // Bandpasses keep only a sliver of the source's energy, so make up for it before the envelope.
  const mix = ctx.createGain();
  mix.gain.value = 5;
  mix.connect(env);
  o.vowel.forEach((f, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(f.freq, o.t);
    bp.Q.value = formantQ(f);
    const level = ctx.createGain();
    level.gain.setValueAtTime(f.gain, o.t);
    for (const [at, vowel] of o.vowels ?? []) {
      bp.frequency.linearRampToValueAtTime(vowel[i]!.freq, o.t + at);
      level.gain.linearRampToValueAtTime(vowel[i]!.gain, o.t + at);
    }
    osc.connect(bp).connect(level).connect(mix);
  });
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.05);
  trackVoice(osc);
}

// --- Drums: (engine, destination, time, velocity, pattern character) ---

export type DrumVoice = (e: Engine, dest: AudioNode, t: number, vel: number, char: string) => void;

export const kick: DrumVoice = (e, dest, t, vel) => {
  tone(e, { freq: 150, to: 46, glide: 0.11, t, dur: 0.28, gain: 0.85 * vel, attack: 0.002, dest });
  noise(e, { t, dur: 0.012, gain: 0.08 * vel, filter: "highpass", freq: 3000, dest });
};

export const clap: DrumVoice = (e, dest, t, vel) => {
  for (const offset of [0, 0.011, 0.023]) {
    noise(e, { t: t + offset, dur: 0.02, gain: 0.3 * vel, filter: "bandpass", freq: 1400, q: 0.9, dest });
  }
  noise(e, { t: t + 0.03, dur: 0.14, gain: 0.2 * vel, filter: "bandpass", freq: 1250, q: 0.8, dest });
};

export const shaker: DrumVoice = (e, dest, t, vel) => {
  noise(e, { t, dur: 0.05, gain: 0.13 * vel, filter: "highpass", freq: 6500, q: 0.7, attack: 0.008, dest });
};

/** Woodblock: uppercase/lowercase X is the high "tick", O the low "tock". */
export const wood: DrumVoice = (e, dest, t, vel, char) => {
  const high = char === "X" || char === "x";
  tone(e, { freq: high ? 1250 : 930, t, dur: 0.06, gain: 0.26 * vel, attack: 0.001, dest });
  noise(e, { t, dur: 0.014, gain: 0.1 * vel, filter: "bandpass", freq: 2400, q: 4, dest });
};
