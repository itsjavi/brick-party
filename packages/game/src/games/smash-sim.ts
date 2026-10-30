import type { FighterRig, FighterStats } from "./doodle-fighter";

/**
 * Doodle Smash's fight rules (DECISION-19): a side-view platform fighter the room runs live at fixed ticks. Everything
 * here is plain arithmetic on small objects, the same on the server (the authority) and in the browser (which moves
 * your own fighter at once with `stepFighter`). Units are world units, y up: the visible stage is `WORLD` wide and
 * tall, and anything past the blast zones (`BLAST`) loses a life.
 *
 * A tick does, for every fighter: inputs (run, jump, drop, fast fall, attack, charge, shield), gravity and movement,
 * platforms and the blast zones. Then attacks land, shots fly and power-ups are grabbed. Hits add damage %, and the more
 * damage a fighter has, the further hits launch it; heavier fighters fly less far.
 */

export const SMASH_TICK_MS = 50;
/** Ticks of "3, 2, 1" before anyone can move. */
export const GO_TICK = 60;
/** Canvas units to world units: a drawing as big as the canvas is 130 units wide. */
export const SMASH_SCALE = 0.19;
export const WORLD = { width: 1600, height: 1000 } as const;
/** Past these, a fighter loses a life. */
export const BLAST = { left: -260, right: 1860, bottom: -240, top: 1300 } as const;
export const SMASH_LIVES = 3;
/** Jumps a fighter gets in the air before landing again: room to recover after being launched, as in Smash. */
export const AIR_JUMPS = 2;
/** Ticks a full charge takes. */
export const CHARGE_TICKS = 24;
/** A release with less charge than this is no boosted attack (the press already attacked). */
export const CHARGE_MIN = 6;
/** Ticks an attack shows; it lands one tick after it starts. */
export const ATTACK_TICKS = 6;
/** Ticks out after a ring-out before coming back, and how long the comeback is invincible. */
export const RESPAWN_TICKS = 30;
export const RESPAWN_INVINCIBLE = 40;
/** How much of a hit each consecutive block lets through; one more block than this breaks the shield. */
export const SHIELD_THROUGH = [0, 0.3, 0.6] as const;
/** Ticks of being stunned when a shield breaks. */
export const SHIELD_BREAK_STUN = 34;
/** Ticks for a shield to recover one block. */
const SHIELD_RECOVER_TICKS = 20;
/** A hit older than this doesn't count as the KO's cause: the fighter fell on its own. */
const KO_CREDIT_TICKS = 160;
/** At most this many recent events are kept for the screens. */
const MAX_EVENTS = 40;

const G = 2.4;
const G_STUN = 1.9;
const MAX_FALL = 26;
const FAST_FALL = 34;
const AIR_ACCEL = 1.8;
const KB_BASE = 4;
const KB_GROWTH = 0.14;
/** A launch at least this strong counts as being sent flying (trails, comebacks). */
export const HARD_LAUNCH = 20;
const SHOT_SPEED = 26;
const SHOT_TICKS = 30;
const ITEM_EVERY = 180;
const ITEM_TICKS = 280;
const MAX_ITEMS = 2;
const ITEM_RADIUS = 20;

/** Input bits a client sends as `held`. */
export const KEY = { left: 1, right: 2, up: 4, down: 8, shield: 16 } as const;
export const KEY_MASK = 31;

export type WeaponKind = "blade" | "blaster";
/** How a fighter attacks: its weapon kind, or fists without a weapon. */
export type SmashWeapon = WeaponKind | "fists";
/** Attack directions: neutral, side, up and down. */
export const DIR = { neutral: 0, side: 1, up: 2, down: 3 } as const;

export const POWER_KINDS = ["heal", "speed", "power", "shield"] as const;
export type PowerKind = (typeof POWER_KINDS)[number];

// Stages

export interface Platform {
  x0: number;
  x1: number;
  /** The top. */
  y: number;
  /** Thickness under the top. Solid platforms block from every side and can't be dropped through. */
  h: number;
  solid: boolean;
  /** Swings back and forth by up to `dx`, `dy` over `period` ticks. */
  move?: { dx: number; dy: number; period: number };
}

export const STAGE_IDS = ["sketchbook", "tower", "split", "bridge"] as const;
export type StageId = (typeof STAGE_IDS)[number];

export interface Stage {
  id: StageId;
  name: string;
  /** One line for the weigh-in. */
  blurb: string;
  platforms: Platform[];
  /** Where fighters start, on platforms. */
  spawns: [number, number][];
  /** Where fighters come back after a ring-out, above the stage. */
  respawn: [number, number];
}

const thin = (x0: number, x1: number, y: number, move?: Platform["move"]): Platform => ({
  x0,
  x1,
  y,
  h: 14,
  solid: false,
  move,
});
const solid = (x0: number, x1: number, y: number, h: number): Platform => ({ x0, x1, y, h, solid: true });

export const STAGES: Record<StageId, Stage> = {
  sketchbook: {
    id: "sketchbook",
    name: "The Sketchbook",
    blurb: "A classic: one big stage and three floating ledges.",
    platforms: [solid(300, 1300, 220, 160), thin(420, 680, 400), thin(920, 1180, 400), thin(670, 930, 580)],
    spawns: [
      [420, 220],
      [1180, 220],
      [560, 400],
      [1040, 400],
      [800, 580],
      [800, 220],
    ],
    respawn: [800, 860],
  },
  tower: {
    id: "tower",
    name: "Paper Tower",
    blurb: "Floor after floor: climb up, drop down, don't fall off.",
    platforms: [
      solid(450, 1150, 160, 140),
      thin(330, 600, 330),
      thin(1000, 1270, 330),
      thin(640, 960, 480),
      thin(360, 620, 630),
      thin(980, 1240, 630),
      thin(660, 940, 790),
    ],
    spawns: [
      [560, 160],
      [1040, 160],
      [460, 330],
      [1140, 330],
      [800, 480],
      [800, 160],
    ],
    respawn: [800, 940],
  },
  split: {
    id: "split",
    name: "Split Desk",
    blurb: "Two desks, a gap between them and a lift that rides up and down.",
    platforms: [
      solid(220, 690, 220, 170),
      solid(910, 1380, 220, 170),
      thin(705, 895, 330, { dx: 0, dy: 150, period: 140 }),
      thin(300, 560, 440),
      thin(1040, 1300, 440),
    ],
    spawns: [
      [360, 220],
      [1240, 220],
      [560, 220],
      [1040, 220],
      [430, 440],
      [1170, 440],
    ],
    respawn: [800, 880],
  },
  bridge: {
    id: "bridge",
    name: "Rope Bridge",
    blurb: "A narrow bridge between two high ledges, and a cloud that drifts across.",
    platforms: [
      solid(520, 1080, 180, 40),
      solid(180, 430, 420, 300),
      solid(1170, 1420, 420, 300),
      thin(620, 980, 640, { dx: 260, dy: 0, period: 220 }),
    ],
    spawns: [
      [300, 420],
      [1300, 420],
      [640, 180],
      [960, 180],
      [800, 180],
      [390, 420],
    ],
    respawn: [800, 900],
  },
};

/** How far a moving platform has swung at `tick`, -1 to 1. */
function swing(p: Platform, tick: number): number {
  return p.move ? Math.sin((2 * Math.PI * tick) / p.move.period) : 0;
}
/** A platform's left edge, right edge and top at `tick`. */
export function platformAt(p: Platform, tick: number): { x0: number; x1: number; y: number } {
  const o = swing(p, tick);
  const dx = p.move ? p.move.dx * o : 0;
  const dy = p.move ? p.move.dy * o : 0;
  return { x0: p.x0 + dx, x1: p.x1 + dx, y: p.y + dy };
}

/** The stage for a fight: a random one from the set, from the fight's seed. */
export function pickStage(seed: number): StageId {
  return STAGE_IDS[mix(seed, 0x57a9e) % STAGE_IDS.length]!;
}

// Fighters

/** What a fighter's drawing makes of it in a fight; fixed for the whole fight. */
export interface SmashSpec {
  /** Hurtbox width and height. */
  w: number;
  h: number;
  /** Heavier fighters fly less far. */
  weight: number;
  /** Top running speed, units per tick. */
  run: number;
  /** Upward speed of a jump. */
  jump: number;
  weapon: SmashWeapon;
  /** How far a melee hit reaches past the body. */
  reach: number;
  /** Damage % of a plain hit (a blaster's shot). */
  damage: number;
  /** Ticks between attacks. */
  cooldown: number;
  /** A blaster shot's radius. */
  shot: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A fighter's fight numbers from its drawing's stats (DECISION-18: shapes only). Body area sets weight, legs set speed
 * and jump height, arms and the weapon set reach, and the weapon's ink sets how hard it hits.
 */
export function smashSpec(stats: FighterStats, rig: FighterRig, kind: WeaponKind): SmashSpec {
  const [bx0, by0, bx1] = rig.bodyBox;
  const top = Math.min(rig.box[1], by0);
  const w = clamp((bx1 - bx0) * SMASH_SCALE, 40, 140);
  const h = clamp((rig.feet - top) * SMASH_SCALE, 52, 180);
  const weapon: SmashWeapon = rig.weapon ? kind : "fists";
  const base = 5 + stats.damage * 0.18;
  const cooldown = clamp(Math.round(4 + stats.cooldown * 0.8), 5, 18);
  return {
    w: round1(w),
    h: round1(h),
    weight: round1(clamp(0.75 + stats.mass * 0.22, 0.8, 1.65) * 100) / 100,
    run: round1(clamp(9 + stats.speed * 0.45, 9, 18)),
    jump: round1(clamp(20 + stats.jump * 0.45, 22, 31)),
    weapon,
    reach: Math.round(
      clamp(12 + stats.reach * (weapon === "fists" ? 0.4 : 0.49), 16, weapon === "fists" ? 70 : 110),
    ),
    damage: round1(weapon === "fists" ? base * 0.8 : weapon === "blaster" ? base * 0.6 : base),
    cooldown:
      weapon === "blaster"
        ? Math.round(cooldown * 1.5)
        : weapon === "fists"
          ? Math.max(5, cooldown - 2)
          : cooldown,
    shot: Math.round(clamp(8 + stats.weaponInk / 3000, 8, 22)),
  };
}

/** One fighter in a fight. Plain numbers and flags, so a tick copies it cheaply and screens get it as is. */
export interface SmashBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  /** The platform it stands on, -1 in the air. */
  gr: number;
  /** Air jumps left. */
  aj: number;
  /** Damage %. */
  dmg: number;
  lives: number;
  /** Ticks until it comes back after a ring-out; 0 in play, -1 once out of lives. */
  out: number;
  /** Ticks of being launched or dizzy, with no control. */
  stun: number;
  /** Ticks of hit-stop: frozen in place for the impact. */
  freeze: number;
  /** Ticks of invincibility after coming back. */
  inv: number;
  /** Ticks until it can attack again. */
  cd: number;
  /** Ticks left of the attack under way (0: none), its direction (`DIR`) and power (1 plain, up to 2.5). */
  atk: number;
  dir: number;
  pow: number;
  /** Whether the attack under way has landed (or fired) yet. */
  swung: boolean;
  /** Ticks the attack key has been held: the charge gauge, up to `CHARGE_TICKS`. */
  chg: number;
  /** Shielding. */
  sh: boolean;
  /** Blocks in a row: each one lets more through (`SHIELD_THROUGH`), and it wears off when not shielding. */
  wear: number;
  /** Ticks of dropping through thin platforms. */
  drop: number;
  /** Power-ups: ticks of speed, the next attack is a big hit, ticks of a shield that doesn't wear. */
  fast: number;
  big: boolean;
  guard: number;
  /** Keys held (`KEY` bits), keys pressed since the last tick, and the attack key. */
  held: number;
  edges: number;
  atkHeld: boolean;
  /** The attack key went down or up since the last tick. */
  press: boolean;
  release: boolean;
  /** The last input message applied (its `seq`), so the owner's screen knows what the server has seen. */
  ack: number;
  /** Who hit it last, and when; -1 for nobody. */
  hitBy: number;
  hitAt: number;
  /** When it was last sent flying, -1 if it's back on its feet since. */
  flung: number;
}

export interface SmashShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  ttl: number;
  dmg: number;
  r: number;
}

export interface SmashItem {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
  ttl: number;
}

export interface SmashEvent {
  /** Counts up through the fight, so screens play each event once. */
  n: number;
  t: number;
  k: "shot" | "hit" | "block" | "break" | "ko" | "power" | "respawn";
  /** The fighter it's about (the attacker for hits); `b` the one on the receiving end. -1 for nobody. */
  a: number;
  b: number;
  /** Damage dealt, or a launch's strength for a KO. */
  d: number;
  x: number;
  y: number;
  /** A power-up's kind, or "big" for a hit that sends someone flying. */
  p: string;
}

/** Counters per fighter, for scoring and awards. */
export interface SmashTally {
  kos: number;
  /** Rings-outs without anyone's help. */
  selfKos: number;
  powerUps: number;
  /** Times sent flying who made it back to a platform. */
  comebacks: number;
  /** The most damage % survived. */
  maxDmg: number;
}

export interface SmashFight {
  tick: number;
  stage: StageId;
  seed: number;
  bodies: SmashBody[];
  shots: SmashShot[];
  items: SmashItem[];
  events: SmashEvent[];
  /** Events so far (the next one's `n`). */
  n: number;
  nextItem: number;
  itemSeq: number;
  /** Fighters in the order they ran out of lives. */
  outOrder: number[];
  /** The tick one fighter was left standing, or -1. */
  over: number;
  tally: SmashTally[];
}

/** A 32-bit hash of a few numbers, for the fight's dice. */
export function mix(...parts: number[]): number {
  let h = 0x2545f491;
  for (const p of parts) h = Math.imul(h ^ (p | 0), 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

function newBody(x: number, y: number, face: 1 | -1): SmashBody {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    face,
    gr: -1,
    aj: AIR_JUMPS,
    dmg: 0,
    lives: SMASH_LIVES,
    out: 0,
    stun: 0,
    freeze: 0,
    inv: 0,
    cd: 0,
    atk: 0,
    dir: 0,
    pow: 1,
    swung: true,
    chg: 0,
    sh: false,
    wear: 0,
    drop: 0,
    fast: 0,
    big: false,
    guard: 0,
    held: 0,
    edges: 0,
    atkHeld: false,
    press: false,
    release: false,
    ack: 0,
    hitBy: -1,
    hitAt: -1,
    flung: -1,
  };
}

/** A fight about to start: everyone on a spawn point, facing the middle. */
export function newFight(stage: StageId, count: number, seed: number): SmashFight {
  const st = STAGES[stage];
  const bodies: SmashBody[] = [];
  for (let i = 0; i < count; i++) {
    const [sx, sy] = st.spawns[i % st.spawns.length]!;
    const lap = Math.floor(i / st.spawns.length);
    const x = sx + (lap ? (lap % 2 ? 46 : -46) * Math.ceil(lap / 2) : 0);
    bodies.push(newBody(x, sy + 2, x < WORLD.width / 2 ? 1 : -1));
  }
  return {
    tick: 0,
    stage,
    seed,
    bodies,
    shots: [],
    items: [],
    events: [],
    n: 0,
    nextItem: GO_TICK + 120,
    itemSeq: 0,
    outOrder: [],
    over: -1,
    tally: bodies.map(() => ({ kos: 0, selfKos: 0, powerUps: 0, comebacks: 0, maxDmg: 0 })),
  };
}

// One fighter's tick

/** What happened to a fighter in `stepFighter`, as bits. */
export const MOVED = { ko: 1, respawn: 2, swing: 4, comeback: 8, jump: 16 } as const;

function startAttack(b: SmashBody, spec: SmashSpec, pow: number) {
  const held = b.held;
  const side = (held & KEY.right ? 1 : 0) - (held & KEY.left ? 1 : 0);
  b.dir = held & KEY.up ? DIR.up : held & KEY.down ? DIR.down : side ? DIR.side : DIR.neutral;
  if (side) b.face = side > 0 ? 1 : -1;
  b.atk = ATTACK_TICKS;
  b.swung = false;
  b.pow = b.big ? Math.max(pow, 2.5) : pow;
  b.big = false;
  b.cd = spec.cooldown;
}

/**
 * Moves one fighter one tick, in place: its timers, its inputs (when `control` is on), gravity, platforms and the
 * blast zones. Hits on others aren't here: the server resolves those in `stepFight`, and a screen predicting its own
 * fighter only needs this part. Returns `MOVED` bits.
 */
export function stepFighter(
  b: SmashBody,
  spec: SmashSpec,
  stage: Stage,
  tick: number,
  slot: number,
  control: boolean,
): number {
  let moved = 0;
  if (b.out < 0) return 0;
  if (b.out > 0) {
    b.out -= 1;
    if (b.out > 0) return 0;
    const [rx, ry] = stage.respawn;
    b.x = rx + ((slot % 5) - 2) * 70;
    b.y = ry;
    b.vx = 0;
    b.vy = 0;
    b.gr = -1;
    b.aj = AIR_JUMPS;
    b.dmg = 0;
    b.stun = 0;
    b.freeze = 0;
    b.inv = RESPAWN_INVINCIBLE;
    b.atk = 0;
    b.chg = 0;
    b.sh = false;
    b.wear = 0;
    b.drop = 0;
    b.flung = -1;
    b.hitBy = -1;
    return MOVED.respawn;
  }
  if (b.freeze > 0) {
    b.freeze -= 1;
    return 0;
  }
  if (b.cd > 0) b.cd -= 1;
  if (b.inv > 0) b.inv -= 1;
  if (b.stun > 0) b.stun -= 1;
  if (b.drop > 0) b.drop -= 1;
  if (b.fast > 0) b.fast -= 1;
  if (b.guard > 0) b.guard -= 1;
  if (b.atk > 0) b.atk -= 1;

  const free = control && b.stun === 0;
  let dirX = 0;
  if (free) {
    const held = b.held;
    const edges = b.edges;
    dirX = (held & KEY.right ? 1 : 0) - (held & KEY.left ? 1 : 0);
    b.sh = (held & KEY.shield) !== 0 && b.atk === 0;
    if (b.sh) dirX = 0;
    if (edges & KEY.up) {
      if (b.gr >= 0) {
        b.vy = spec.jump * (b.fast > 0 ? 1.12 : 1);
        b.gr = -1;
        b.sh = false;
        moved |= MOVED.jump;
      } else if (b.aj > 0) {
        b.vy = spec.jump * 0.92 * (b.fast > 0 ? 1.12 : 1);
        b.aj -= 1;
        moved |= MOVED.jump;
      }
    }
    if (edges & KEY.down && b.gr >= 0 && !stage.platforms[b.gr]!.solid) {
      b.drop = 6;
      b.gr = -1;
      b.y -= 2;
    }
    if (held & KEY.down && b.gr < 0 && b.vy < 2) b.vy = Math.min(b.vy, -FAST_FALL);
    if (b.press && !b.sh) {
      if (b.cd === 0) {
        startAttack(b, spec, 1);
        moved |= MOVED.swing;
      }
      b.chg = 0;
    }
    if (b.release) {
      if (b.chg >= CHARGE_MIN && !b.sh) {
        startAttack(b, spec, 1 + 1.5 * Math.min(1, b.chg / CHARGE_TICKS));
        moved |= MOVED.swing;
      }
      b.chg = 0;
    }
    if (b.atkHeld && !b.sh) b.chg = Math.min(CHARGE_TICKS, b.chg + 1);
    if (dirX && b.atk === 0) b.face = dirX > 0 ? 1 : -1;
  } else if (b.stun > 0) {
    b.sh = false;
    b.chg = 0;
  }
  b.edges = 0;
  b.press = false;
  b.release = false;
  if (!b.sh && b.wear > 0) b.wear = Math.max(0, b.wear - 1 / SHIELD_RECOVER_TICKS);

  // Running and air control.
  const speed = spec.run * (b.fast > 0 ? 1.35 : 1) * (b.chg > 3 ? 0.55 : 1);
  if (b.stun > 0) {
    if (b.gr < 0) b.vx *= 0.97;
    else b.vx *= 0.8;
  } else if (b.gr >= 0) {
    if (dirX) b.vx += clamp(dirX * speed - b.vx, -speed * 0.5, speed * 0.5);
    else b.vx *= 0.6;
  } else {
    const target = dirX * speed * 0.85;
    if (dirX) b.vx += clamp(target - b.vx, -AIR_ACCEL, AIR_ACCEL);
    else b.vx *= 0.96;
  }
  if (Math.abs(b.vx) < 0.2) b.vx = 0;

  // Standing on a platform moves with it; otherwise gravity.
  const prevY = b.y;
  const plats = stage.platforms;
  if (b.gr >= 0) {
    const p = plats[b.gr]!;
    if (p.move) {
      const o0 = swing(p, tick - 1);
      const o1 = swing(p, tick);
      b.x += p.move.dx * (o1 - o0);
    }
  } else {
    b.vy = Math.max(b.vy - (b.stun > 0 ? G_STUN : G), Math.min(b.vy, -MAX_FALL));
  }
  b.x += b.vx;
  if (b.gr < 0) b.y += b.vy;

  if (b.gr >= 0) {
    const p = plats[b.gr]!;
    const o = swing(p, tick);
    const x0 = p.x0 + (p.move ? p.move.dx * o : 0);
    const x1 = p.x1 + (p.move ? p.move.dx * o : 0);
    const reach = spec.w * 0.3;
    if (b.x < x0 - reach || b.x > x1 + reach) {
      b.gr = -1;
      b.aj = Math.max(b.aj, AIR_JUMPS);
    } else {
      b.y = p.y + (p.move ? p.move.dy * o : 0);
      b.vy = 0;
    }
  }
  if (b.gr < 0) {
    const half = spec.w / 2;
    for (let j = 0; j < plats.length; j++) {
      const p = plats[j]!;
      const o = swing(p, tick);
      const ox = p.move ? p.move.dx * o : 0;
      const top = p.y + (p.move ? p.move.dy * o : 0);
      const prevTop = p.move ? p.y + p.move.dy * swing(p, tick - 1) : top;
      const x0 = p.x0 + ox;
      const x1 = p.x1 + ox;
      // Landing from above.
      if (
        b.vy <= 0 &&
        prevY >= prevTop - 2 &&
        b.y <= top &&
        b.x + spec.w * 0.3 >= x0 &&
        b.x - spec.w * 0.3 <= x1
      ) {
        if (!p.solid && b.drop > 0) continue;
        b.y = top;
        b.vy = 0;
        b.gr = j;
        b.aj = AIR_JUMPS;
        if (b.stun > 6) b.stun = 6;
        if (b.flung >= 0) {
          moved |= MOVED.comeback;
          b.flung = -1;
        }
        break;
      }
      // Solid platforms block from below and the sides.
      if (p.solid && b.x + half > x0 && b.x - half < x1 && b.y < top && b.y + spec.h > top - p.h) {
        if (prevY + spec.h <= top - p.h + 1) {
          b.y = top - p.h - spec.h;
          if (b.vy > 0) b.vy = 0;
        } else if (prevY < top - 1) {
          if (b.x < (x0 + x1) / 2) b.x = x0 - half;
          else b.x = x1 + half;
          b.vx = b.stun > 0 ? -b.vx * 0.4 : 0;
        }
      }
    }
  }

  if (b.x < BLAST.left || b.x > BLAST.right || b.y < BLAST.bottom || b.y > BLAST.top) moved |= MOVED.ko;
  return moved;
}

// The whole fight's tick

function emit(
  f: SmashFight,
  k: SmashEvent["k"],
  a: number,
  b: number,
  d: number,
  x: number,
  y: number,
  p = "",
) {
  f.events.push({ n: f.n, t: f.tick, k, a, b, d: Math.round(d), x: Math.round(x), y: Math.round(y), p });
  f.n += 1;
}

/** Applies a hit from `a` (or a shot of theirs) to `v`: through a shield if it's up, then damage and a launch. */
function applyHit(
  f: SmashFight,
  cast: SmashSpec[],
  a: number,
  v: number,
  dmg: number,
  angle: number,
  kb: number,
  dirX: number,
  melee: boolean,
) {
  const victim = f.bodies[v]!;
  const spec = cast[v]!;
  let broke = false;
  if (victim.sh) {
    // A block still wearing off counts in full until it has.
    const level = Math.ceil(victim.wear - 1e-6);
    if (level >= SHIELD_THROUGH.length) {
      broke = true;
      victim.sh = false;
      victim.wear = 0;
      emit(f, "break", a, v, 0, victim.x, victim.y + spec.h / 2);
    } else {
      const through = SHIELD_THROUGH[level]!;
      if (victim.guard <= 0) victim.wear = level + 1;
      emit(f, "block", a, v, dmg * through, victim.x, victim.y + spec.h / 2);
      if (through === 0) {
        victim.vx += dirX * 3;
        victim.freeze = 2;
        if (melee) f.bodies[a]!.freeze = 2;
        return;
      }
      dmg *= through;
      kb *= through;
    }
  }
  victim.dmg = Math.min(999, victim.dmg + dmg);
  const tally = f.tally[v]!;
  if (victim.dmg > tally.maxDmg) tally.maxDmg = Math.round(victim.dmg);
  const launch = ((KB_BASE + victim.dmg * KB_GROWTH) * (0.4 + dmg / 14) * kb) / spec.weight;
  const rad = (angle * Math.PI) / 180;
  victim.vx = dirX * Math.cos(rad) * launch;
  victim.vy = Math.sin(rad) * launch;
  if (victim.gr >= 0) {
    if (victim.vy < 0) victim.vy = -victim.vy * 0.5;
    victim.gr = -1;
    victim.y += 1;
  }
  // Short enough that a launched fighter gets control back in time to jump back toward the stage.
  victim.stun = clamp(Math.round(launch * 0.32), 4, 24);
  if (broke) victim.stun = Math.max(victim.stun, SHIELD_BREAK_STUN);
  victim.atk = 0;
  victim.chg = 0;
  victim.sh = false;
  const stop = clamp(Math.round(1 + dmg / 5), 2, 6);
  victim.freeze = stop;
  if (melee) f.bodies[a]!.freeze = stop;
  victim.hitBy = a;
  victim.hitAt = f.tick;
  if (launch >= HARD_LAUNCH) victim.flung = f.tick;
  emit(f, "hit", a, v, dmg, victim.x, victim.y + spec.h / 2, launch >= HARD_LAUNCH ? "big" : "");
}

/** Launch angles in degrees by attack direction, and how hard each knocks back. */
const ANGLES = [40, 30, 85, -60];
const KNOCK = [1, 1.15, 1.05, 0.95];

function overlaps(b: SmashBody, s: SmashSpec, x0: number, x1: number, y0: number, y1: number): boolean {
  return b.x + s.w / 2 > x0 && b.x - s.w / 2 < x1 && b.y + s.h > y0 && b.y < y1;
}

/** Lands the attack fighter `i` just started: a melee hitbox in front, above or below, or a blaster shot. */
function resolveAttack(f: SmashFight, cast: SmashSpec[], i: number) {
  const b = f.bodies[i]!;
  if (b.out !== 0 || b.atk === 0 || b.atk >= ATTACK_TICKS || b.swung || b.freeze > 0) return;
  b.swung = true;
  const s = cast[i]!;
  const dmg = s.damage * b.pow;
  if (s.weapon === "blaster") {
    const angle = b.dir === DIR.up ? 0.6 : b.dir === DIR.down && b.gr < 0 ? -0.6 : 0;
    const r = s.shot * (b.pow > 1.3 ? 1.4 : 1);
    f.shots.push({
      x: b.x + b.face * (s.w / 2 + r),
      y: b.y + s.h * 0.55,
      vx: b.face * SHOT_SPEED * Math.cos(angle),
      vy: SHOT_SPEED * Math.sin(angle),
      owner: i,
      ttl: SHOT_TICKS,
      dmg: Math.round(dmg * 10) / 10,
      r,
    });
    emit(f, "shot", i, -1, dmg, b.x, b.y + s.h * 0.55, b.pow > 1.3 ? "big" : "");
    return;
  }
  const r = s.reach * (b.pow > 1.3 ? 1.15 : 1);
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (b.dir === DIR.up) {
    x0 = b.x - s.w * 0.6;
    x1 = b.x + s.w * 0.6;
    y0 = b.y + s.h * 0.5;
    y1 = b.y + s.h + r * 0.8;
  } else if (b.dir === DIR.down && b.gr < 0) {
    x0 = b.x - s.w * 0.6;
    x1 = b.x + s.w * 0.6;
    y0 = b.y - r * 0.7;
    y1 = b.y + s.h * 0.3;
  } else if (b.dir === DIR.down) {
    x0 = b.x - s.w / 2 - r * 0.6;
    x1 = b.x + s.w / 2 + r * 0.6;
    y0 = b.y;
    y1 = b.y + s.h * 0.4;
  } else {
    const near = b.x + b.face * (s.w / 2 - 4);
    const far = b.x + b.face * (s.w / 2 + r);
    x0 = Math.min(near, far);
    x1 = Math.max(near, far);
    y0 = b.y + s.h * 0.1;
    y1 = b.y + s.h * 0.9;
  }
  const kb = KNOCK[b.dir]! * (s.weapon === "fists" ? 0.9 : 1);
  for (let j = 0; j < f.bodies.length; j++) {
    const v = f.bodies[j]!;
    if (j === i || v.out !== 0 || v.inv > 0 || !overlaps(v, cast[j]!, x0, x1, y0, y1)) continue;
    const dirX = b.dir === DIR.side || b.dir === DIR.neutral ? b.face : v.x >= b.x ? 1 : -1;
    const angle = b.dir === DIR.down && b.gr >= 0 ? 20 : ANGLES[b.dir]!;
    applyHit(f, cast, i, j, dmg, angle, kb, dirX, true);
  }
}

function stepShots(f: SmashFight, cast: SmashSpec[], stage: Stage) {
  if (!f.shots.length) return;
  const kept: SmashShot[] = [];
  for (const shot of f.shots) {
    shot.x += shot.vx;
    shot.y += shot.vy;
    shot.ttl -= 1;
    let gone =
      shot.ttl <= 0 ||
      shot.x < BLAST.left ||
      shot.x > BLAST.right ||
      shot.y < BLAST.bottom ||
      shot.y > BLAST.top;
    for (let j = 0; !gone && j < stage.platforms.length; j++) {
      const p = stage.platforms[j]!;
      if (!p.solid) continue;
      if (shot.x > p.x0 && shot.x < p.x1 && shot.y < p.y && shot.y > p.y - p.h) gone = true;
    }
    for (let j = 0; !gone && j < f.bodies.length; j++) {
      const v = f.bodies[j]!;
      if (j === shot.owner || v.out !== 0 || v.inv > 0) continue;
      if (!overlaps(v, cast[j]!, shot.x - shot.r, shot.x + shot.r, shot.y - shot.r, shot.y + shot.r))
        continue;
      applyHit(f, cast, shot.owner, j, shot.dmg, 20, 0.65, shot.vx >= 0 ? 1 : -1, false);
      gone = true;
    }
    if (!gone) kept.push(shot);
  }
  f.shots = kept;
}

function stepItems(f: SmashFight, cast: SmashSpec[], stage: Stage) {
  if (f.items.length) {
    const kept: SmashItem[] = [];
    for (const item of f.items) {
      item.ttl -= 1;
      let taken = item.ttl <= 0;
      for (let j = 0; !taken && j < f.bodies.length; j++) {
        const b = f.bodies[j]!;
        const s = cast[j]!;
        if (
          b.out !== 0 ||
          Math.abs(b.x - item.x) > s.w / 2 + ITEM_RADIUS ||
          item.y < b.y - ITEM_RADIUS ||
          item.y > b.y + s.h + ITEM_RADIUS
        )
          continue;
        taken = true;
        if (item.kind === "heal") b.dmg = Math.max(0, b.dmg - 40);
        else if (item.kind === "speed") b.fast = 160;
        else if (item.kind === "power") b.big = true;
        else {
          b.wear = 0;
          b.guard = 200;
        }
        f.tally[j]!.powerUps += 1;
        emit(f, "power", j, -1, 0, item.x, item.y, item.kind);
      }
      if (!taken) kept.push(item);
    }
    f.items = kept;
  }
  if (f.tick >= f.nextItem && f.over < 0) {
    const h = mix(f.seed, f.tick, f.itemSeq);
    f.nextItem = f.tick + ITEM_EVERY + (h % 80);
    if (f.items.length < MAX_ITEMS) {
      const fixed = stage.platforms.filter((p) => !p.move);
      const p = fixed[(h >>> 4) % fixed.length]!;
      const span = Math.max(1, p.x1 - p.x0 - 80);
      f.itemSeq += 1;
      f.items.push({
        id: f.itemSeq,
        kind: POWER_KINDS[(h >>> 12) % POWER_KINDS.length]!,
        x: Math.round(p.x0 + 40 + ((h >>> 16) % span)),
        y: p.y + ITEM_RADIUS,
        ttl: ITEM_TICKS,
      });
    }
  }
}

/** Copies a fight deeply enough that a tick can change the copy in place. */
function cloneFight(f: SmashFight): SmashFight {
  return {
    ...f,
    bodies: f.bodies.map((b) => ({ ...b })),
    shots: f.shots.map((s) => ({ ...s })),
    items: f.items.map((i) => ({ ...i })),
    events: f.events.slice(),
    outOrder: f.outOrder.slice(),
    tally: f.tally.map((t) => ({ ...t })),
  };
}

/** How many fighters still have lives. */
export const fightersLeft = (f: Pick<SmashFight, "bodies">) =>
  f.bodies.reduce((n, b) => n + (b.lives > 0 ? 1 : 0), 0);

/**
 * One tick of the whole fight, as a new fight (the old one is left alone). Before `GO_TICK` nobody can move. The same
 * fight and inputs always give the same result.
 */
export function stepFight(fight: SmashFight, cast: SmashSpec[]): SmashFight {
  const f = cloneFight(fight);
  f.tick += 1;
  const stage = STAGES[f.stage];
  const control = f.tick > GO_TICK;
  for (let i = 0; i < f.bodies.length; i++) {
    const b = f.bodies[i]!;
    const s = cast[i]!;
    // Swings and jumps show in the bodies themselves (`atk`, `vy`), so they cost no events.
    const moved = stepFighter(b, s, stage, f.tick, i, control);
    if (moved & MOVED.respawn) emit(f, "respawn", i, -1, 0, b.x, b.y);
    if (moved & MOVED.comeback) f.tally[i]!.comebacks += 1;
    if (moved & MOVED.ko) {
      const by = b.hitBy >= 0 && f.tick - b.hitAt <= KO_CREDIT_TICKS ? b.hitBy : -1;
      if (by >= 0) f.tally[by]!.kos += 1;
      else f.tally[i]!.selfKos += 1;
      b.lives -= 1;
      emit(
        f,
        "ko",
        by,
        i,
        Math.hypot(b.vx, b.vy),
        clamp(b.x, 0, WORLD.width),
        clamp(b.y, 0, WORLD.height),
        b.lives > 0 ? "" : "out",
      );
      b.out = b.lives > 0 ? RESPAWN_TICKS : -1;
      b.vx = 0;
      b.vy = 0;
      b.flung = -1;
      if (b.lives <= 0) f.outOrder.push(i);
    }
  }
  for (let i = 0; i < f.bodies.length; i++) resolveAttack(f, cast, i);
  stepShots(f, cast, stage);
  if (control) stepItems(f, cast, stage);
  if (f.over < 0 && f.bodies.length >= 2 && fightersLeft(f) <= 1) f.over = f.tick;
  if (f.events.length > MAX_EVENTS) f.events = f.events.slice(-MAX_EVENTS);
  return f;
}

// Views

/**
 * The fields of a body that screens need to draw it, in the order `packBody` packs them: an update about twelve
 * fighters stays around a kilobyte. A screen gets its own fighter in full, to move it at once.
 */
const PACKED = [
  "x",
  "y",
  "vx",
  "vy",
  "face",
  "gr",
  "dmg",
  "lives",
  "out",
  "stun",
  "freeze",
  "inv",
  "atk",
  "dir",
  "pow",
  "chg",
  "sh",
  "wear",
  "fast",
  "big",
  "guard",
  "aj",
  "cd",
] as const;

const round = (n: number, places: number) => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

/** A body as a short row of numbers, rounded. */
export function packBody(b: SmashBody): number[] {
  return [
    round(b.x, 1),
    round(b.y, 1),
    round(b.vx, 1),
    round(b.vy, 1),
    b.face,
    b.gr,
    round(b.dmg, 1),
    b.lives,
    b.out,
    b.stun,
    b.freeze,
    b.inv,
    b.atk,
    b.dir,
    round(b.pow, 2),
    b.chg,
    b.sh ? 1 : 0,
    round(b.wear, 2),
    b.fast,
    b.big ? 1 : 0,
    b.guard,
    b.aj,
    b.cd,
  ];
}

/** A packed body back as a body; what packing leaves out (inputs, who hit it) starts empty. */
export function unpackBody(row: readonly number[]): SmashBody {
  const b = newBody(0, 0, 1);
  const get = (field: (typeof PACKED)[number]) => row[PACKED.indexOf(field)] ?? 0;
  return Object.assign(b, {
    x: get("x"),
    y: get("y"),
    vx: get("vx"),
    vy: get("vy"),
    face: get("face") < 0 ? -1 : 1,
    gr: get("gr"),
    dmg: get("dmg"),
    lives: get("lives"),
    out: get("out"),
    stun: get("stun"),
    freeze: get("freeze"),
    inv: get("inv"),
    atk: get("atk"),
    dir: get("dir"),
    pow: get("pow") || 1,
    chg: get("chg"),
    sh: get("sh") === 1,
    wear: get("wear"),
    fast: get("fast"),
    big: get("big") === 1,
    guard: get("guard"),
    aj: get("aj"),
    cd: get("cd"),
  } satisfies Partial<SmashBody>);
}

/** A shot as `[x, y, vx, vy, owner, radius]`. */
export function packShot(s: SmashShot): number[] {
  return [round(s.x, 1), round(s.y, 1), round(s.vx, 1), round(s.vy, 1), s.owner, round(s.r, 1)];
}

export function unpackShot(row: readonly number[]): SmashShot {
  const [x = 0, y = 0, vx = 0, vy = 0, owner = -1, r = 8] = row;
  return { x, y, vx, vy, owner, r, ttl: 1, dmg: 0 };
}

/** Applies a player's key state to their fighter, in place: held keys, and presses that must not be missed. */
export function applyInput(
  b: SmashBody,
  held: number,
  attack: "press" | "release" | null | undefined,
  seq: number,
) {
  const keys = held & KEY_MASK;
  b.edges |= keys & ~b.held;
  b.held = keys;
  if (attack === "press" && !b.atkHeld) {
    b.atkHeld = true;
    b.press = true;
  } else if (attack === "release" && b.atkHeld) {
    b.atkHeld = false;
    b.release = true;
  }
  if (seq > b.ack) b.ack = seq;
}

/**
 * Fighters best first: those still standing by lives left, then KOs, then least damage; then the rest, last out
 * first.
 */
export function fightPlacing(f: Pick<SmashFight, "bodies" | "outOrder" | "tally">): number[] {
  const standing = f.bodies
    .map((_, i) => i)
    .filter((i) => f.bodies[i]!.lives > 0)
    .sort((a, b) => {
      const A = f.bodies[a]!;
      const B = f.bodies[b]!;
      return B.lives - A.lives || f.tally[b]!.kos - f.tally[a]!.kos || A.dmg - B.dmg || a - b;
    });
  const out = [...f.outOrder].reverse();
  const rest = f.bodies.map((_, i) => i).filter((i) => !standing.includes(i) && !out.includes(i));
  return [...standing, ...out, ...rest];
}

// Bots

/** The part of a fight a bot looks at: what a screen gets in its view is enough. */
export type SmashSight = Pick<SmashFight, "tick" | "stage" | "seed" | "bodies" | "shots" | "items">;

export interface SmashBotInput {
  held: number;
  attack: boolean;
}

/** A steady 0..1 for a fighter over a stretch of ticks: the bot's whims. */
const whim = (seed: number, me: number, tick: number, salt: number) => mix(seed, me, tick, salt) / 4294967296;

/** The platform right under a point (the highest top at or below it), or -1. */
function platformUnder(stage: Stage, x: number, y: number, tick: number): number {
  let best = -1;
  let bestTop = -Infinity;
  for (let j = 0; j < stage.platforms.length; j++) {
    const p = platformAt(stage.platforms[j]!, tick);
    if (x >= p.x0 && x <= p.x1 && p.y <= y + 4 && p.y > bestTop) {
      best = j;
      bestTop = p.y;
    }
  }
  return best;
}

/**
 * A simple live fighter: get back to the stage when off it, grab power-ups that are close, walk up to the nearest
 * foe and hit it (charging now and then), shoot from afar with a blaster, shield when something is coming, and jump
 * or drop to reach foes on other floors. Its whims change every few ticks, so it doesn't play the same every time.
 * Returns the keys it wants held; jumps and drops are presses, so it lets go of a key to press it again.
 */
export function smashBot(f: SmashSight, cast: SmashSpec[], me: number): SmashBotInput {
  const b = f.bodies[me];
  const s = cast[me];
  const out: SmashBotInput = { held: 0, attack: false };
  if (!b || !s || b.out !== 0 || b.stun > 0 || f.tick < GO_TICK) return out;
  const stage = STAGES[f.stage];
  const press = (key: number) => {
    if (!(b.held & key)) out.held |= key;
  };
  const toward = (x: number) => {
    if (x > b.x + 8) out.held |= KEY.right;
    else if (x < b.x - 8) out.held |= KEY.left;
  };
  const mood = whim(f.seed, me, f.tick >> 4, 1);

  // Off the stage: head back and jump.
  const under = platformUnder(stage, b.x, b.y, f.tick);
  if (under < 0) {
    let home = stage.platforms[0]!;
    let best = Infinity;
    for (const p of stage.platforms) {
      const at = platformAt(p, f.tick);
      const d = Math.abs((at.x0 + at.x1) / 2 - b.x) + Math.max(0, at.y - b.y);
      if (d < best) {
        best = d;
        home = p;
      }
    }
    const at = platformAt(home, f.tick);
    // Under a solid stage, get out from under it first, or the jump bumps its head.
    const underneath = home.solid && b.y < at.y - home.h && b.x > at.x0 - s.w && b.x < at.x1 + s.w;
    if (underneath) toward(b.x < (at.x0 + at.x1) / 2 ? at.x0 - s.w - 30 : at.x1 + s.w + 30);
    else toward((at.x0 + at.x1) / 2);
    if (b.vy <= 1 && b.y < at.y + 60) press(KEY.up);
    return out;
  }

  // The nearest foe, and a power-up if one is closer.
  let foe = -1;
  let foeDist = Infinity;
  for (let j = 0; j < f.bodies.length; j++) {
    const o = f.bodies[j]!;
    if (j === me || o.out !== 0) continue;
    const d = Math.hypot(o.x - b.x, (o.y - b.y) * 1.5);
    if (d < foeDist) {
      foeDist = d;
      foe = j;
    }
  }
  let goalX: number | null = null;
  let goalY = b.y;
  for (const item of f.items) {
    const d = Math.hypot(item.x - b.x, item.y - b.y);
    if (d < 420 && d < foeDist * 0.9) {
      goalX = item.x;
      goalY = item.y - 20;
    }
  }

  // A quick tap, or now and then a charge: hold until the gauge is as full as this whim wants.
  if (b.atkHeld) {
    out.attack = mood < 0.25 && b.chg < 10 + Math.floor(mood * 50);
    if (foe >= 0) toward(f.bodies[foe]!.x);
    return out;
  }

  if (foe >= 0 && goalX === null) {
    const o = f.bodies[foe]!;
    const os = cast[foe]!;
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    // Something coming: shield, if the shield can take it.
    const threat =
      (o.atk > 0 && Math.abs(dx) < os.reach + os.w + s.w) ||
      f.shots.some(
        (sh) =>
          sh.owner !== me &&
          Math.abs(sh.x - b.x) < 140 &&
          Math.abs(sh.y - (b.y + s.h / 2)) < 60 &&
          Math.sign(b.x - sh.x) === Math.sign(sh.vx),
      );
    if (threat && b.gr >= 0 && b.wear < 2 && whim(f.seed, me, f.tick >> 2, 2) < 0.45) {
      out.held |= KEY.shield;
      return out;
    }
    const reach = s.weapon === "blaster" ? 620 : s.reach + (s.w + os.w) / 2;
    const level = Math.abs(dy) < Math.max(s.h, os.h) * 0.8;
    const facing = Math.sign(dx) === b.face || Math.abs(dx) < 6;
    if (s.weapon === "blaster") {
      if (level && Math.abs(dx) < reach && Math.abs(dx) > 90) {
        if (!facing) toward(o.x);
        else if (b.cd === 0 && whim(f.seed, me, f.tick >> 1, 3) < 0.6) out.attack = true;
        return out;
      }
      if (Math.abs(dx) <= 90 && b.gr >= 0) {
        // Too close for comfort: back off.
        toward(b.x - Math.sign(dx || 1) * 200);
        return out;
      }
    } else if (Math.abs(dx) <= reach && (level || (dy > 0 && dy < s.h + s.reach))) {
      // Above: an up attack. Level: turn to face it, then a side attack.
      const above = dy > s.h * 0.6;
      if (!facing && !above) toward(o.x);
      if (b.cd === 0) {
        if (above) out.held |= KEY.up;
        out.attack = whim(f.seed, me, f.tick >> 1, 4) < 0.75;
      }
      return out;
    }
    goalX = o.x;
    goalY = o.y;
  }
  if (goalX === null) return out;

  // Walk to the goal, jumping up to it or dropping down to it, without walking off the stage.
  const step = goalX > b.x + 10 ? 1 : goalX < b.x - 10 ? -1 : 0;
  if (step) {
    // Never off the stage after a foe that's off it.
    const ahead = platformUnder(stage, b.x + step * (s.w + 30), b.y + 2, f.tick);
    const goalOn = platformUnder(stage, goalX, goalY + 10, f.tick) >= 0;
    if (ahead >= 0 || (b.gr < 0 && goalOn)) out.held |= step > 0 ? KEY.right : KEY.left;
    else if (goalOn && Math.abs(goalX - b.x) > 150) {
      // A gap to the goal: jump it.
      out.held |= step > 0 ? KEY.right : KEY.left;
      press(KEY.up);
    }
  }
  if (goalY > b.y + 70 && (b.gr >= 0 || (b.vy < 0 && b.aj > 0))) press(KEY.up);
  else if (goalY < b.y - 70 && b.gr >= 0 && !stage.platforms[b.gr]!.solid) press(KEY.down);
  // Now and then, start charging a big one on the way.
  if (b.cd === 0 && mood < 0.12 && Math.abs(goalX - b.x) < 260) out.attack = true;
  return out;
}
