import {
  ACT,
  FLOOR_SCALE,
  FRAME_STRIDE,
  type FightEvent,
  type FighterRig,
  type FighterStats,
} from "@brick/game";

/** What a fighter needs to be posed: its rig and stats, from the server or worked out from a drawing in progress. */
export interface Posable {
  rig: FighterRig;
  stats: FighterStats;
}

/** Where a fighter is and what it's doing at one moment, in floor units and ticks. */
export interface Moment {
  x: number;
  /** Height above the floor. */
  y: number;
  act: number;
  /** Which way it looks on screen. */
  face: 1 | -1;
  /** How far it has walked so far, for the gait. */
  dist: number;
  /** The moment, in ticks (fractional). */
  t: number;
  /** Ticks since its last swing, its last hit taken and its knockout; `Infinity` when there's none yet. */
  sinceAttack: number;
  sinceHurt: number;
  sinceKo: number;
}

/** Angles in degrees and offsets in canvas units, for the fighter's own drawing. */
export interface Pose {
  /** One angle per limb in `rig.limbs`. */
  limbs: number[];
  weapon: number;
  body: number;
  /** Rotate the body around its feet (falling over) instead of its center (rolling). */
  aroundFeet: boolean;
  bob: number;
  jitter: number;
  /** Vertical squash: below 1 is squashed, above 1 stretched. */
  squash: number;
  skew: number;
  /** Extra height for a knockout's flight, in floor units. */
  lift: number;
  /** 0 to 1: how white the hit flash is. */
  flash: number;
  opacity: number;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** An arm's swing over the ticks after an attack: wind up, smash forward, settle. */
const SWING = [-55, 45, 28, 10, 0];

function swing(since: number): number {
  if (since < 0 || since >= SWING.length - 1) return 0;
  const i = Math.floor(since);
  return lerp(SWING[i]!, SWING[i + 1]!, since - i);
}

/**
 * How a fighter's drawn parts move at a moment: legs swing from the hip in a gait set by how it moves (alternating
 * for two legs, a ripple for many), arms rotate at the shoulder and smash forward on a swing, a legless fighter rolls,
 * hops with squash and stretch, or slides with a wobble, and hits, topples and knockouts take over the whole body.
 */
export function poseAt(fighter: Posable, m: Moment): Pose {
  const { rig, stats } = fighter;
  // Rotations are in the drawing's own frame: "forward" is the way the drawing looks.
  const front = rig.facesRight ? 1 : -1;
  const legLength = Math.max(20, stats.legLength * FLOOR_SCALE);
  const phase = (m.dist / legLength) * Math.PI;
  const moving = m.act === ACT.move;
  const airborne = m.act === ACT.air || m.y > 0.5;
  let legIndex = 0;
  let armIndex = 0;
  const amplitude = stats.style === "stride" ? 32 : stats.style === "scuttle" ? 22 : 26;
  const limbs = rig.limbs.map((limb) => {
    if (limb.part === "legs") {
      const k = legIndex++;
      if (airborne) return (k % 2 ? 16 : -16) * front;
      if (!moving) return Math.sin(m.t * 0.25 + k) * 3;
      const offset = stats.style === "scuttle" ? (k * Math.PI) / 2 : k * Math.PI;
      return Math.sin(phase + offset) * amplitude;
    }
    const k = armIndex++;
    const strike = swing(m.sinceAttack - k * 0.4);
    if (strike) return strike * front;
    return (Math.sin(m.t * 0.2 + k * 1.3) * 8 + (moving ? Math.sin(phase + k * Math.PI) * 12 : 0)) * front;
  });
  const weapon = rig.weapon && rig.weapon.arm === null ? swing(m.sinceAttack) * 0.7 * front : 0;

  let body = 0;
  let aroundFeet = false;
  let bob = 0;
  let squash = 1;
  let skew = 0;
  let lift = 0;
  let opacity = 1;
  if (stats.style === "roll") body = (((m.dist / Math.max(15, stats.halfWidth)) * 180) / Math.PI) * front;
  else if (stats.style === "hop")
    squash = airborne ? 1.1 : moving || m.sinceAttack < 2 ? 0.86 : 1 + Math.sin(m.t * 0.3) * 0.03;
  else if (stats.style === "slide") skew = Math.sin(m.t * 0.5) * 8 * (moving ? 1 : 0.3);
  else if (moving) bob = -Math.abs(Math.sin(phase)) * 14;
  if (m.sinceAttack < 3 && stats.style !== "roll") body += 9 * front * (1 - m.sinceAttack / 3);

  const flash = m.sinceHurt < 3 ? 1 - m.sinceHurt / 3 : 0;
  const jitter = flash ? Math.sin(m.t * 9) * 10 * flash : 0;
  if (flash && stats.style !== "roll") body -= 10 * front * flash;
  if (m.act === ACT.down) {
    body = -85 * front;
    aroundFeet = true;
  }
  if (m.act === ACT.ko) {
    // Knocked out: spins up into the air, then lands flat.
    const k = clamp(m.sinceKo / 7, 0, 1);
    body = (-90 - 540 * (1 - k)) * front;
    aroundFeet = k >= 1;
    lift = Math.sin(Math.PI * k) * 70;
    opacity = 0.75;
  }
  return { limbs, weapon, body, aroundFeet, bob, jitter, squash, skew, lift, flash, opacity };
}

/** A fight's frames, read at any moment: positions in between ticks, and how long since each fighter's last swing. */
export class FightTrack {
  readonly length: number;
  private readonly dist: number[][];
  private readonly attacks: number[][];
  private readonly hurts: number[][];
  private readonly kos: number[];

  constructor(
    private readonly frames: number[][],
    events: FightEvent[],
    count: number,
  ) {
    this.length = Math.max(1, frames.length);
    this.dist = Array.from({ length: count }, () => [0]);
    this.attacks = Array.from({ length: count }, () => []);
    this.hurts = Array.from({ length: count }, () => []);
    this.kos = Array.from({ length: count }, () => Infinity);
    for (let f = 1; f < frames.length; f++) {
      for (let i = 0; i < count; i++) {
        const moved = Math.abs(frames[f]![i * FRAME_STRIDE]! - frames[f - 1]![i * FRAME_STRIDE]!);
        this.dist[i]!.push(this.dist[i]!.at(-1)! + moved);
        if (frames[f]![i * FRAME_STRIDE + 3] === ACT.attack) this.attacks[i]!.push(f);
      }
    }
    for (const e of events) {
      if ((e.k === "hit" || e.k === "crit") && e.b !== undefined) this.hurts[e.b]!.push(e.t);
      if (e.k === "wall") this.hurts[e.a]!.push(e.t);
      if (e.k === "ko" && e.b !== undefined) this.kos[e.b] = Math.min(this.kos[e.b]!, e.t);
    }
  }

  /** The last frame's tick. */
  get end(): number {
    return this.length - 1;
  }

  /** Fighter `i` at tick `t` (fractional; past the end it stays on the last frame). */
  moment(i: number, t: number): Moment & { hp: number } {
    const at = clamp(t, 0, this.end);
    const f0 = Math.floor(at);
    const f1 = Math.min(this.end, f0 + 1);
    const u = at - f0;
    const a = this.frames[f0] ?? [];
    const b = this.frames[f1] ?? a;
    const o = i * FRAME_STRIDE;
    const since = (ticks: number[]) => {
      let last = -Infinity;
      for (const tick of ticks) if (tick <= at) last = tick;
      return t - last;
    };
    return {
      x: lerp(a[o] ?? 0, b[o] ?? 0, u),
      y: lerp(a[o + 1] ?? 0, b[o + 1] ?? 0, u),
      hp: a[o + 2] ?? 0,
      act: a[o + 3] ?? 0,
      face: a[o + 4] ? 1 : -1,
      dist: lerp(this.dist[i]![f0] ?? 0, this.dist[i]![f1] ?? 0, u),
      t,
      sinceAttack: since(this.attacks[i]!),
      sinceHurt: since(this.hurts[i]!),
      sinceKo: t - this.kos[i]!,
    };
  }
}
