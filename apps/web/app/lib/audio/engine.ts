import { settingsStore } from "./settings";
import { sliderToGain } from "./theory";

/** Bus levels at full slider, so music sits under the sound effects. */
const MUSIC_LEVEL = 0.5;
const SFX_LEVEL = 0.9;
const RAMP = 0.05;

export interface Engine {
  ctx: AudioContext;
  /** Mute switch, before the limiter. */
  master: GainNode;
  music: GainNode;
  /** Between the music and the master: big hits dip it for a moment so they cut through (`duckMusic`). */
  duck: GainNode;
  sfx: GainNode;
  /** Reverb send inputs; each returns into its own bus so the sliders control it too. */
  musicVerb: GainNode;
  sfxVerb: GainNode;
  /** One second of white noise every noisy voice reuses. */
  noise: AudioBuffer;
}

let engine: Engine | null = null;
let activeVoices = 0;

export const getEngine = () => engine;
export const voiceCount = () => activeVoices;

/** Counts a source as a playing voice until it ends, so dense moments can drop optional notes. */
export function trackVoice(node: AudioScheduledSourceNode) {
  activeVoices += 1;
  node.onended = () => {
    activeVoices -= 1;
  };
}

export function isRunning(e: Engine | null): e is Engine {
  return !!e && e.ctx.state === "running";
}

export function musicAudible(): boolean {
  const s = settingsStore.get();
  return !s.muted && s.music > 0;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function applySettings(e: Engine) {
  const s = settingsStore.get();
  const t = e.ctx.currentTime;
  e.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, RAMP);
  e.music.gain.setTargetAtTime(sliderToGain(s.music) * MUSIC_LEVEL, t, RAMP);
  e.sfx.gain.setTargetAtTime(sliderToGain(s.sfx) * SFX_LEVEL, t, RAMP);
}

/** Dips the music by `depth` (0..1) right now, then lets it recover from `hold` seconds later. */
export function duckMusic(e: Engine, depth: number, hold: number) {
  const gain = e.duck.gain;
  const t = e.ctx.currentTime;
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(Math.min(gain.value, 1), t);
  gain.linearRampToValueAtTime(1 - depth, t + 0.015);
  gain.setTargetAtTime(1, t + hold, 0.2);
}

/**
 * A silent copy of the bus graph on an OfflineAudioContext, at full level and without the limiter, so a sound can be
 * rendered and looked at (the audio lab's sound prints). Its context never "runs", so only render with it directly.
 */
export function offlineEngine(seconds: number, sampleRate = 44100): Engine {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const duck = ctx.createGain();
  duck.connect(master);
  const music = ctx.createGain();
  music.connect(duck);
  const sfx = ctx.createGain();
  sfx.connect(master);
  const room = makeImpulse(ctx, 1.3, 3.2);
  const musicVerb = ctx.createGain();
  const musicConv = ctx.createConvolver();
  musicConv.buffer = room;
  musicVerb.connect(musicConv).connect(music);
  const sfxVerb = ctx.createGain();
  const sfxConv = ctx.createConvolver();
  sfxConv.buffer = room;
  sfxVerb.connect(sfxConv).connect(sfx);
  // Recipes only schedule nodes, which an offline context supports the same way.
  return { ctx: ctx as unknown as AudioContext, master, music, duck, sfx, musicVerb, sfxVerb, noise: makeNoise(ctx) };
}

/** Creates the AudioContext and the bus graph once. Client only; returns null where Web Audio is missing. */
export function createEngine(): Engine | null {
  if (engine) return engine;
  if (typeof window === "undefined") return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor({ latencyHint: "interactive" });
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(limiter);
  const duck = ctx.createGain();
  duck.connect(master);
  const music = ctx.createGain();
  music.connect(duck);
  const sfx = ctx.createGain();
  sfx.connect(master);

  const room = makeImpulse(ctx, 1.3, 3.2);
  const musicVerb = ctx.createGain();
  const musicConv = ctx.createConvolver();
  musicConv.buffer = room;
  musicVerb.connect(musicConv).connect(music);
  const sfxVerb = ctx.createGain();
  const sfxConv = ctx.createConvolver();
  sfxConv.buffer = room;
  sfxVerb.connect(sfxConv).connect(sfx);

  engine = { ctx, master, music, duck, sfx, musicVerb, sfxVerb, noise: makeNoise(ctx) };
  applySettings(engine);
  settingsStore.subscribe(() => engine && applySettings(engine));
  return engine;
}
