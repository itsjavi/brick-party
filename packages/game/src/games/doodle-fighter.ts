import { drawShapes } from "../draw-shapes";
import { createRng, type Rng } from "../rng";
import { DRAW_SIZES, fillRings, type Stroke, type StrokePart } from "./skip-logic";

/**
 * Doodle Champions' fighters: what a drawing's shapes make of a fighter (DECISION-18). Stats come from the geometry of
 * each part alone, never from colors, and the rig says where each limb joins the body so screens can animate the drawn
 * strokes. Fights are simple side-view rules on a flat floor, resolved tick by tick from a seeded rng into frames every
 * screen replays the same way. Everything here is cheap: stats are computed once per fighter from a few thousand
 * points, and a fight is a few hundred ticks of plain arithmetic.
 */

export type Pt = [number, number];
/** `[left, top, right, bottom]` in canvas units (y down). */
export type Box = [number, number, number, number];

/** How a fighter gets around, from its legs (or lack of them) and its body. */
export type MoveStyle = "walk" | "stride" | "scuttle" | "hop" | "roll" | "slide";

export interface FighterStats {
  legs: number;
  arms: number;
  /** Average leg length, in canvas units. */
  legLength: number;
  /** Longest arm, in canvas units. */
  armLength: number;
  /** How much ink the weapon took: line length times pen width, plus filled area. 0 without one. */
  weaponInk: number;
  /** The weapon's longest extent, in canvas units. */
  weaponLength: number;
  /** The body's area (its convex outline), in square canvas units. */
  bodyArea: number;
  /** 1 for a circle, lower for corners and long shapes. */
  roundness: number;
  /** The body's height over its width. */
  tallness: number;
  style: MoveStyle;
  /** Tall bodies fall over when hit hard, and lie stunned for a moment. */
  topples: boolean;
  /** A long, thin or tiny body: a noodle, for the awards and the commentary. */
  noodle: boolean;
  hp: number;
  /** Heavier fighters fly less far when hit, and walk slower. */
  mass: number;
  /** Floor units per tick at full stride. */
  speed: number;
  /** Upward speed of a jump, floor units per tick. */
  jump: number;
  /** How far past its body a fighter hits, in floor units. */
  reach: number;
  /** Average damage of one hit. */
  damage: number;
  /** Ticks between attacks. */
  cooldown: number;
  /** Half the body's width on the floor, in floor units. */
  halfWidth: number;
  /** A rough fighting strength, for the betting odds only. */
  power: number;
}

export interface Limb {
  part: "legs" | "arms";
  /** Indexes into the fighter's strokes. */
  strokes: number[];
  /** Where it joins the body, in canvas units: legs swing and arms rotate around it. */
  pivot: Pt;
  /** Its farthest point from the pivot. */
  tip: Pt;
  length: number;
}

export interface FighterRig {
  /** Body strokes (tagged body, or untagged). */
  body: number[];
  center: Pt;
  bodyBox: Box;
  limbs: Limb[];
  /** The weapon, held by an arm (`arm` is a `limbs` index) or fixed to the body. */
  weapon: { strokes: number[]; arm: number | null; pivot: Pt; tip: Pt } | null;
  /** The lowest point the fighter stands on (legs, or the body without them), in canvas units. */
  feet: number;
  /** Everything drawn. */
  box: Box;
  /** Which way the drawing looks: towards its arms and weapon. */
  facesRight: boolean;
}

/** Canvas units to floor units: a fighter drawn across the whole canvas is 320 units wide on the floor. */
export const FLOOR_SCALE = 0.32;
export const TICK_MS = 100;
/** A fighter is lighter than a Skip Logic drawing, so fights stay cheap to send and to replay. */
export const DOODLE_LIMITS = { maxStrokes: 120, maxValues: 4000 };
export const DUEL_WIDTH = 1000;
export const FFA_WIDTH = 1600;
const GRAVITY = 2.2;
/** How close a stroke must come to the body (or to a limb) to join it, in canvas units. */
const TOUCH = 60;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const partOf = (s: Pick<Stroke, "t">): StrokePart => s.t ?? "body";

function pointsOf(s: Stroke): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) out.push([s.p[i]!, s.p[i + 1]!]);
  return out;
}

/** At most `max` points, evenly picked, always keeping the last. */
function sample(points: Pt[], max: number): Pt[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: Pt[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]!);
  out.push(points.at(-1)!);
  return out;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** The convex outline of some points, counterclockwise in y-up terms (monotone chain). */
export function convexHull(points: Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const lower: Pt[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function polygonArea(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function perimeter(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len, 0, 1) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distance from a point to a convex outline: 0 inside it. */
function hullDistance(hull: Pt[], p: Pt): number {
  if (hull.length === 0) return Infinity;
  if (hull.length === 1) return Math.hypot(p[0] - hull[0]![0], p[1] - hull[0]![1]);
  if (hull.length >= 3) {
    const sign = Math.sign(cross(hull[0]!, hull[1]!, hull[2]!));
    let inside = true;
    for (let i = 0; i < hull.length && inside; i++) {
      if (Math.sign(cross(hull[i]!, hull[(i + 1) % hull.length]!, p)) === -sign) inside = false;
    }
    if (inside) return 0;
  }
  let best = Infinity;
  for (let i = 0; i < hull.length; i++)
    best = Math.min(best, segmentDistance(p, hull[i]!, hull[(i + 1) % hull.length]!));
  return best;
}

function boxOf(points: Pt[]): Box {
  if (!points.length) return [400, 400, 600, 600];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

function closestPair(a: Pt[], b: Pt[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]));
  return best;
}

function farthest(from: Pt, points: Pt[]): { tip: Pt; length: number } {
  let tip = from;
  let length = 0;
  for (const p of points) {
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (d > length) {
      length = d;
      tip = p;
    }
  }
  return { tip, length };
}

function strokeLength(points: Pt[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  return sum;
}

/** The body's points, or everything drawn when no stroke is body. */
function bodyPoints(strokes: Stroke[], body: number[]): Pt[] {
  const from = body.length ? body.map((i) => strokes[i]!) : strokes;
  return from.flatMap(pointsOf);
}

/** The body's convex outline, worked out once per drawing (the rig and the stats both need it). */
const hulls = new WeakMap<Stroke[], Pt[]>();
function bodyHull(strokes: Stroke[], bodyPts: Pt[]): Pt[] {
  let hull = hulls.get(strokes);
  if (!hull) {
    hull = convexHull(sample(bodyPts, 400));
    hulls.set(strokes, hull);
  }
  return hull;
}

/**
 * Groups a part's strokes into limbs. A stroke that touches the body starts a limb at the point where it touches; one
 * that doesn't joins the limb it touches (a foot, a second line for the same leg), and a fill joins the limb nearest to
 * it. A stroke touching neither still counts as a limb of its own.
 */
function buildLimbs(strokes: Stroke[], indexes: number[], hull: Pt[], part: "legs" | "arms"): Limb[] {
  const items = indexes
    .map((i) => {
      const pts = sample(pointsOf(strokes[i]!), 32);
      let gap = Infinity;
      let at: Pt = pts[0] ?? [500, 500];
      for (const p of pts) {
        const d = hullDistance(hull, p);
        if (d < gap) {
          gap = d;
          at = p;
        }
      }
      return { i, pts, at, gap, fill: strokes[i]!.k === "fill" };
    })
    .sort((a, b) => a.gap - b.gap || a.i - b.i);
  const limbs: (Limb & { pts: Pt[] })[] = [];
  for (const item of items) {
    if (item.gap > TOUCH || item.fill) {
      const mine = sample(item.pts, 16);
      let best = -1;
      let bestDistance = item.fill ? Infinity : TOUCH;
      limbs.forEach((limb, index) => {
        const d = closestPair(mine, sample(limb.pts, 24));
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      if (best >= 0) {
        const limb = limbs[best]!;
        limb.strokes.push(item.i);
        limb.pts = [...limb.pts, ...item.pts];
        Object.assign(limb, farthest(limb.pivot, limb.pts));
        continue;
      }
    }
    limbs.push({ part, strokes: [item.i], pivot: item.at, pts: item.pts, ...farthest(item.at, item.pts) });
  }
  return limbs.map(({ pts: _pts, ...limb }) => ({
    ...limb,
    pivot: [Math.round(limb.pivot[0]), Math.round(limb.pivot[1])] as Pt,
    tip: [Math.round(limb.tip[0]), Math.round(limb.tip[1])] as Pt,
    length: Math.round(limb.length),
  }));
}

/** Where every part joins the body, for the animation. The same strokes always give the same rig. */
export function fighterRig(strokes: Stroke[]): FighterRig {
  const byPart = (part: StrokePart) => strokes.flatMap((s, i) => (partOf(s) === part ? [i] : []));
  const body = byPart("body");
  const bodyPts = bodyPoints(strokes, body);
  const hull = bodyHull(strokes, bodyPts);
  const bodyBox = boxOf(bodyPts);
  const center: Pt = [Math.round((bodyBox[0] + bodyBox[2]) / 2), Math.round((bodyBox[1] + bodyBox[3]) / 2)];
  const limbs = [
    ...buildLimbs(strokes, byPart("legs"), hull, "legs"),
    ...buildLimbs(strokes, byPart("arms"), hull, "arms"),
  ];

  let weapon: FighterRig["weapon"] = null;
  const weaponStrokes = byPart("weapon");
  if (weaponStrokes.length) {
    const pts = sample(
      weaponStrokes.flatMap((i) => pointsOf(strokes[i]!)),
      64,
    );
    // Held by the arm whose tip is nearest, if one is near enough; otherwise fixed where it's closest to the body.
    let arm: number | null = null;
    let best = 140;
    limbs.forEach((limb, index) => {
      if (limb.part !== "arms") return;
      const d = closestPair([limb.tip], pts);
      if (d < best) {
        best = d;
        arm = index;
      }
    });
    let pivot: Pt;
    if (arm !== null) pivot = limbs[arm]!.pivot;
    else {
      pivot = pts[0]!;
      let gap = Infinity;
      for (const p of pts) {
        const d = hullDistance(hull, p);
        if (d < gap) {
          gap = d;
          pivot = p;
        }
      }
    }
    const { tip } = farthest(pivot, pts);
    weapon = {
      strokes: weaponStrokes,
      arm,
      pivot: [Math.round(pivot[0]), Math.round(pivot[1])],
      tip: [Math.round(tip[0]), Math.round(tip[1])],
    };
  }

  const legPts = limbs
    .filter((l) => l.part === "legs")
    .flatMap((l) => l.strokes.flatMap((i) => pointsOf(strokes[i]!)));
  const feet = Math.max(bodyBox[3], ...legPts.map((p) => p[1]));
  // Faces where its arms and weapon point.
  const lean =
    limbs.filter((l) => l.part === "arms").reduce((sum, l) => sum + (l.tip[0] - center[0]), 0) +
    (weapon ? 2 * (weapon.tip[0] - center[0]) : 0);
  return {
    body,
    center,
    bodyBox,
    limbs,
    weapon,
    feet,
    box: boxOf(strokes.flatMap(pointsOf)),
    facesRight: lean >= 0,
  };
}

function inkOf(strokes: Stroke[], indexes: number[]): number {
  let ink = 0;
  for (const i of indexes) {
    const s = strokes[i]!;
    if (s.k === "fill") ink += fillRings(s.p).reduce((sum, ring) => sum + polygonArea(ring), 0);
    else ink += strokeLength(pointsOf(s)) * (DRAW_SIZES[s.w] ?? DRAW_SIZES[1]!);
  }
  return ink;
}

/**
 * A fighter's stats from its shapes alone: the body's area sets weight and health, legs set speed and jumping, arms
 * set reach and how often it hits, and the weapon's ink and length add damage and reach but slow the swing.
 */
export function fighterStats(strokes: Stroke[], rig: FighterRig = fighterRig(strokes)): FighterStats {
  const hull = bodyHull(strokes, bodyPoints(strokes, rig.body));
  const bodyArea = Math.max(1500, polygonArea(hull));
  const per = perimeter(hull);
  const roundness =
    hull.length >= 3 && per > 0 ? clamp((4 * Math.PI * polygonArea(hull)) / (per * per), 0, 1) : 0;
  const [x0, y0, x1, y1] = rig.bodyBox;
  const w = Math.max(10, x1 - x0);
  const h = Math.max(10, y1 - y0);
  const tallness = h / w;

  const legs = rig.limbs.filter((l) => l.part === "legs");
  const arms = rig.limbs.filter((l) => l.part === "arms");
  const legLength = legs.length ? legs.reduce((sum, l) => sum + l.length, 0) / legs.length : 0;
  const armLength = arms.reduce((max, l) => Math.max(max, l.length), 0);
  const weaponBox = rig.weapon ? boxOf(rig.weapon.strokes.flatMap((i) => pointsOf(strokes[i]!))) : null;
  const weaponLength = weaponBox ? Math.hypot(weaponBox[2] - weaponBox[0], weaponBox[3] - weaponBox[1]) : 0;
  const weaponInk = rig.weapon ? inkOf(strokes, rig.weapon.strokes) : 0;

  const mass = clamp(0.5 + bodyArea / 90000, 0.5, 4);
  const leg = legLength * FLOOR_SCALE;
  let style: MoveStyle;
  let base: number;
  if (legs.length === 0) {
    if (roundness >= 0.86) [style, base] = ["roll", 10];
    else if (tallness < 0.6) [style, base] = ["slide", 5];
    else [style, base] = ["hop", 8];
  } else {
    style = legs.length >= 4 && leg < 70 ? "scuttle" : leg >= 95 ? "stride" : "walk";
    base = 4 + Math.min(legs.length, 8) * 1.1 + leg * 0.08;
  }
  const speed = clamp(base / Math.sqrt(mass), 2.5, 22);
  const jump = legs.length ? 9 + leg * 0.12 : style === "hop" ? 13 : 7;
  const held = rig.weapon?.arm !== null && rig.weapon !== null;
  let reach = arms.length ? armLength * FLOOR_SCALE : 8;
  if (rig.weapon)
    reach = held
      ? reach + weaponLength * FLOOR_SCALE * 0.7
      : Math.max(reach, weaponLength * FLOOR_SCALE * 0.6);
  reach = clamp(reach, 8, 200);
  const damage = 1.6 * (5 + 3 * Math.sqrt(mass) + (arms.length ? 1.5 : 0) + Math.min(14, weaponInk / 2500));
  const cooldown = clamp(
    Math.round(10 - 1.5 * Math.min(arms.length, 4) + weaponLength / 180 + (mass - 1) * 1.5),
    4,
    18,
  );
  const hp = Math.round(60 + 40 * mass);
  const halfWidth = Math.max(18, (w / 2) * FLOOR_SCALE);
  const power = hp * ((damage * 0.75) / cooldown) * (1 + reach / 120) * (1 + speed / 25);
  return {
    legs: legs.length,
    arms: arms.length,
    legLength: Math.round(legLength),
    armLength: Math.round(armLength),
    weaponInk: Math.round(weaponInk),
    weaponLength: Math.round(weaponLength),
    bodyArea: Math.round(bodyArea),
    roundness: round2(roundness),
    tallness: round2(tallness),
    style,
    topples: tallness >= 1.7,
    noodle: Math.max(w, h) / Math.min(w, h) >= 3 || bodyArea < 7000,
    hp,
    mass: round2(mass),
    speed: round1(speed),
    jump: round1(jump),
    reach: Math.round(reach),
    damage: round1(damage),
    cooldown,
    halfWidth: Math.round(halfWidth),
    power: Math.round(power),
  };
}

/** One sentence on how a fighter moves, for cards and the commentary. */
export function styleLine(stats: Pick<FighterStats, "style" | "legs">): string {
  switch (stats.style) {
    case "roll":
      return "Rolls (round, no legs)";
    case "hop":
      return "Hops (no legs)";
    case "slide":
      return "Slides (flat, no legs)";
    case "scuttle":
      return `Scuttles on ${stats.legs} legs`;
    case "stride":
      return `Strides on ${stats.legs === 1 ? "one long leg" : `${stats.legs} long legs`}`;
    case "walk":
      return stats.legs === 1 ? "Pogos on one leg" : `Walks on ${stats.legs} legs`;
  }
}

// Fights

/** What a fighter is doing in a frame. */
export const ACT = { idle: 0, move: 1, attack: 2, hurt: 3, down: 4, ko: 5, air: 6 } as const;
/** Numbers per fighter per frame: x, height above the floor, health, `ACT`, facing right (1) or left (0). */
export const FRAME_STRIDE = 5;

export interface FightEvent {
  /** The tick it happened on. */
  t: number;
  k: "hit" | "crit" | "miss" | "ko" | "topple" | "wall" | "jump";
  /** Index of the fighter it's about (the attacker for hits), in the fight's own order. */
  a: number;
  /** The one on the receiving end. */
  b?: number;
  /** Damage dealt. */
  d?: number;
}

export interface FightResult {
  /** Fighter ids, in the fight's own order. */
  fighters: string[];
  /** The floor's width in floor units. */
  width: number;
  /** One frame per tick from 0: `FRAME_STRIDE` numbers per fighter. */
  frames: number[][];
  events: FightEvent[];
  /** `null` for a draw. */
  winnerId: string | null;
  how: "ko" | "decision" | "draw";
  /** Best first: standing fighters by health left, then the knocked out, last out first. */
  placing: string[];
  /** Fighter id to the fighter that knocked it out. */
  koBy: Record<string, string>;
}

export interface FightEntrant {
  id: string;
  stats: FighterStats;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  cd: number;
  stun: number;
  hop: number;
  face: number;
  koAt: number | null;
  lastHitBy: number | null;
  hurt: boolean;
  act: number;
}

/**
 * Plays a fight out by simple rules, the same way every time for the same fighters and seed. Each tick every
 * standing fighter walks (or hops, rolls, slides) towards the nearest opponent until it's in reach, then swings
 * whenever its cooldown allows. Hits push the target back by damage over weight, tall fighters topple, walls bounce.
 * It ends when one fighter is left, or at `maxTicks` on health left.
 */
export function resolveFight(entrants: FightEntrant[], seed: number, maxTicks: number): FightResult {
  const rng = createRng(seed);
  const n = entrants.length;
  const width = n > 2 ? FFA_WIDTH : DUEL_WIDTH;
  const order = rng.shuffle(entrants.map((_, i) => i));
  const bodies: Body[] = entrants.map((e) => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: e.stats.hp,
    cd: 3 + rng.int(4),
    stun: 0,
    hop: 0,
    face: 1,
    koAt: null,
    lastHitBy: null,
    hurt: false,
    act: ACT.idle,
  }));
  order.forEach((index, slot) => {
    const b = bodies[index]!;
    b.x =
      n === 2 ? (slot === 0 ? width * 0.2 : width * 0.8) : width * (0.1 + (0.8 * slot) / Math.max(1, n - 1));
    b.face = b.x < width / 2 ? 1 : -1;
  });
  const events: FightEvent[] = [];
  const frames: number[][] = [];
  const alive = () => bodies.filter((b) => b.koAt === null).length;
  const record = () =>
    frames.push(
      bodies.flatMap((b) => [
        Math.round(b.x),
        Math.round(b.y),
        Math.max(0, Math.round(b.hp)),
        b.koAt !== null ? ACT.ko : b.act,
        b.face > 0 ? 1 : 0,
      ]),
    );
  const knockOut = (t: number, index: number) => {
    const b = bodies[index]!;
    if (b.koAt !== null) return;
    b.hp = 0;
    b.koAt = t;
    events.push({ t, k: "ko", a: b.lastHitBy ?? index, b: index });
  };
  record();

  let t = 0;
  while (t < maxTicks && alive() > 1) {
    t += 1;
    for (const b of bodies) b.hurt = false;
    const turn = t % 2 ? bodies.map((_, i) => i) : bodies.map((_, i) => n - 1 - i);
    for (const i of turn) {
      const me = bodies[i]!;
      if (me.koAt !== null) continue;
      const s = entrants[i]!.stats;
      me.cd = Math.max(0, me.cd - 1);
      if (me.stun > 0) {
        me.stun -= 1;
        me.act = ACT.down;
        continue;
      }
      let target = -1;
      for (let j = 0; j < n; j++) {
        if (j === i || bodies[j]!.koAt !== null) continue;
        if (target === -1 || Math.abs(bodies[j]!.x - me.x) < Math.abs(bodies[target]!.x - me.x)) target = j;
      }
      if (target === -1) {
        me.act = ACT.idle;
        continue;
      }
      const them = bodies[target]!;
      const ts = entrants[target]!.stats;
      me.face = Math.sign(them.x - me.x) || me.face;
      const gap = Math.abs(them.x - me.x) - s.halfWidth - ts.halfWidth;
      const grounded = me.y <= 0;
      if (gap > s.reach) {
        // A fighter about to come into reach lunges the last stretch, so short arms still get their hits in.
        let drive = gap < s.reach + 120 ? s.speed * 1.6 : s.speed;
        if (s.style === "hop") {
          if (grounded) {
            drive = 0;
            if (me.hop <= 0) {
              me.vy = s.jump;
              me.hop = 2;
            } else me.hop -= 1;
          } else drive = s.speed * 1.7;
        } else if (
          grounded &&
          (s.style === "stride" || s.style === "walk") &&
          gap > s.reach + 80 &&
          rng.next() < 0.03
        ) {
          me.vy = s.jump;
          events.push({ t, k: "jump", a: i });
        }
        // Stop just inside reach rather than walking through the other fighter.
        const step = Math.min(drive, Math.max(0, gap - s.reach * 0.7));
        me.x += step * me.face;
        me.act = me.y > 0 || me.vy > 0 ? ACT.air : step > 0 ? ACT.move : ACT.idle;
        continue;
      }
      me.act = me.y > 0 ? ACT.air : ACT.idle;
      if (me.cd > 0) continue;
      me.act = ACT.attack;
      me.cd = s.cooldown;
      const hitChance = clamp(0.8 - ts.speed / 80, 0.5, 0.85);
      if (rng.next() >= hitChance) {
        events.push({ t, k: "miss", a: i, b: target });
        continue;
      }
      const crit = rng.next() < 0.15;
      const damage = Math.max(1, Math.round(s.damage * (0.6 + rng.next() * 0.8) * (crit ? 1.8 : 1)));
      them.hp -= damage;
      them.hurt = true;
      them.lastHitBy = i;
      const knock = (damage + 3) / ts.mass;
      them.vx += knock * me.face;
      them.vy += crit ? 6 : 2;
      events.push({ t, k: crit ? "crit" : "hit", a: i, b: target, d: damage });
      if (them.hp <= 0) knockOut(t, target);
      else if (ts.topples && knock > 7 && them.stun === 0) {
        them.stun = 8;
        events.push({ t, k: "topple", a: target });
      }
    }

    // Movement from knockback and gravity, then the walls.
    bodies.forEach((b, i) => {
      const half = entrants[i]!.stats.halfWidth;
      b.x += b.vx;
      b.vx *= b.y <= 0 ? 0.65 : 0.9;
      if (Math.abs(b.vx) < 0.3) b.vx = 0;
      b.y += b.vy;
      b.vy -= GRAVITY;
      if (b.y <= 0) {
        b.y = 0;
        b.vy = 0;
      }
      const lo = half;
      const hi = width - half;
      if (b.x < lo || b.x > hi) {
        if (Math.abs(b.vx) > 9 && b.koAt === null) {
          events.push({ t, k: "wall", a: i });
          b.hp -= 2;
          b.hurt = true;
          if (b.hp <= 0) knockOut(t, i);
        }
        b.x = clamp(b.x, lo, hi);
        b.vx = -b.vx * 0.3;
      }
    });
    // Standing fighters can't pass through each other.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        if (a.koAt !== null || b.koAt !== null) continue;
        const overlap = entrants[i]!.stats.halfWidth + entrants[j]!.stats.halfWidth - Math.abs(a.x - b.x);
        if (overlap <= 0 || a.y > 40 || b.y > 40) continue;
        const dir = Math.sign(b.x - a.x) || 1;
        a.x = clamp(
          a.x - (dir * overlap) / 2,
          entrants[i]!.stats.halfWidth,
          width - entrants[i]!.stats.halfWidth,
        );
        b.x = clamp(
          b.x + (dir * overlap) / 2,
          entrants[j]!.stats.halfWidth,
          width - entrants[j]!.stats.halfWidth,
        );
      }
    }
    for (const b of bodies) if (b.hurt && b.koAt === null && b.stun === 0) b.act = ACT.hurt;
    record();
  }

  const share = (i: number) => bodies[i]!.hp / entrants[i]!.stats.hp;
  const indexes = entrants.map((_, i) => i);
  const standing = indexes
    .filter((i) => bodies[i]!.koAt === null)
    .sort((a, b) => share(b) - share(a) || a - b);
  const out = indexes
    .filter((i) => bodies[i]!.koAt !== null)
    .sort((a, b) => bodies[b]!.koAt! - bodies[a]!.koAt! || a - b);
  const placing = [...standing, ...out].map((i) => entrants[i]!.id);
  let winner: number | null;
  let how: FightResult["how"];
  if (standing.length <= 1) {
    winner = standing[0] ?? null;
    how = winner === null ? "draw" : "ko";
  } else {
    winner = standing[0]!;
    how = "decision";
    if (n === 2 && Math.abs(share(standing[0]!) - share(standing[1]!)) < 0.02) {
      winner = null;
      how = "draw";
    }
  }
  const koBy: Record<string, string> = {};
  for (const e of events) {
    if (e.k === "ko" && e.b !== undefined && e.a !== e.b) koBy[entrants[e.b]!.id] = entrants[e.a]!.id;
  }
  return {
    fighters: entrants.map((e) => e.id),
    width,
    frames,
    events,
    winnerId: winner === null ? null : entrants[winner]!.id,
    how,
    placing,
    koBy,
  };
}

// Commentary

/** A line of commentary from tick `t`. `{n}` stands for fighter number n (1-based) in the game's list of fighters. */
export interface Caption {
  t: number;
  text: string;
}

const OPENERS = [
  "{A} and {B} square up.",
  "Ding ding! {A} versus {B}.",
  "{A} sizes up {B}. {B} sizes up {A}.",
  "The crowd goes mild for {A} and {B}!",
  "{A} against {B}. Somebody's getting erased.",
  "Pencils down, fists up: {A} vs {B}.",
];
const FFA_OPENERS = [
  "Everybody in! It's a free-for-all.",
  "The whole sketchbook in one ring. Go!",
  "One belt. Too many doodles. Fight!",
];
const STYLE_LINES: Record<MoveStyle, string[]> = {
  roll: ["{A} rolls in like a bowling ball.", "No legs, no problem: {A} just rolls."],
  hop: ["{A} hops in. Legs are optional.", "Boing, boing: here comes {A}."],
  slide: ["{A} slides in like a sad pancake.", "{A} oozes forward, menacingly."],
  scuttle: ["{A} scuttles in on {L} legs. Nobody likes this.", "So many legs! {A} scuttles closer."],
  stride: ["{A} takes enormous strides.", "{A} covers the floor in three steps."],
  walk: ["{A} strolls in like it owns the place.", "{A} walks up, all confidence."],
};
const CRIT_LINES = [
  "{A} lands a monster hit on {B}!",
  "Oof! {B} felt that one.",
  "{A} connects with everything it's got!",
  "What a shot from {A}!",
];
const TOPPLE_LINES = [
  "{A} topples like a tall tower.",
  "Timber! {A} is down.",
  "{A} falls over. Tall problems.",
];
const WALL_LINES = ["{A} gets bounced off the wall!", "{A} meets the wall. The wall wins."];
const KO_LINES = [
  "{A} knocks out {B}!",
  "{B} is seeing stars. {A} wins!",
  "Lights out for {B}!",
  "{B} has been erased. {A} takes it!",
];
const NOODLE_KO_LINES = [
  "{B} got noodled! {A} wins!",
  "Defeated by a noodle. {B} will never live this down.",
];
const DECISION_LINES = [
  "Time! {A} wins on points.",
  "The judges go with {A}.",
  "Nobody fell, but {A} is clearly ahead.",
];
const DRAW_LINES = [
  "Time! Nobody blinked. It's a draw.",
  "Dead even. Everyone's a winner, nobody's a winner.",
];
const FFA_WIN_LINES = [
  "{A} is the Doodle Champion!",
  "{A} stands alone. Champion!",
  "All hail {A}, champion of the sketchbook!",
];

/**
 * Stock commentary for a fight, used when Claude isn't writing it: an opener, a line on how someone moves, the big
 * moments, and the finish. `nums` gives each fighter's number in the game (1-based), for the `{n}` placeholders.
 */
export function stockCommentary(
  fight: FightResult,
  nums: number[],
  stats: FighterStats[],
  seed: number,
): Caption[] {
  const rng: Rng = createRng(seed ^ 0x27d4eb2d);
  const tag = (i: number) => `{${nums[i]}}`;
  const fill = (line: string, a: number, b?: number) =>
    line
      .replaceAll("{A}", tag(a))
      .replaceAll("{B}", b === undefined ? "" : tag(b))
      .replaceAll("{L}", String(stats[a]?.legs ?? 0));
  const end = fight.frames.length - 1;
  const lines: Caption[] = [];
  const ffa = fight.fighters.length > 2;
  lines.push({ t: 0, text: ffa ? rng.pick(FFA_OPENERS) : fill(rng.pick(OPENERS), 0, 1) });
  // The most unusual mover gets a line.
  const unusual = stats.map((s, i) => ({
    i,
    score: { roll: 3, hop: 3, slide: 3, scuttle: 2, stride: 1, walk: 0 }[s.style] + (s.legs >= 5 ? 1 : 0),
  }));
  const mover = unusual.sort((a, b) => b.score - a.score || a.i - b.i)[0];
  if (mover && end > 12)
    lines.push({ t: 6, text: fill(rng.pick(STYLE_LINES[stats[mover.i]!.style]), mover.i) });
  let last = 6;
  for (const e of fight.events) {
    if (lines.length >= 5 || e.t >= end - 8 || e.t - last < 22) continue;
    const pool =
      e.k === "crit" ? CRIT_LINES : e.k === "topple" ? TOPPLE_LINES : e.k === "wall" ? WALL_LINES : null;
    if (!pool) continue;
    lines.push({ t: e.t, text: fill(rng.pick(pool), e.a, e.b) });
    last = e.t;
  }
  const winner = fight.winnerId === null ? -1 : fight.fighters.indexOf(fight.winnerId);
  const loser = fight.fighters.indexOf(fight.placing.at(-1)!);
  let finish: string;
  if (winner < 0) finish = rng.pick(DRAW_LINES);
  else if (ffa) finish = fill(rng.pick(FFA_WIN_LINES), winner);
  else if (fight.how === "ko")
    finish = fill(rng.pick(stats[winner]?.noodle ? NOODLE_KO_LINES : KO_LINES), winner, loser);
  else finish = fill(rng.pick(DECISION_LINES), winner, loser);
  lines.push({ t: end, text: finish });
  return lines;
}

/** Fills `{n}` placeholders with fighter names (`names[n - 1]`). */
export function withNames(text: string, names: readonly string[]): string {
  return text.replace(/\{(\d+)\}/g, (_, n: string) => names[Number(n) - 1] ?? "someone");
}

// Names

const COLOR_WORDS = ["Inky", "Snowy", "Red", "Golden", "Teal", "Blue", "Purple", "Pink", "Gray"];
const NAME_WORDS: Record<MoveStyle, string[]> = {
  roll: ["Boulder", "Meatball", "Marble", "Pebble"],
  hop: ["Bean", "Blob", "Jelly", "Dumpling"],
  slide: ["Pancake", "Slug", "Puddle", "Doormat"],
  scuttle: ["Centipede", "Crawler", "Beetle", "Spider"],
  stride: ["Stilts", "Heron", "Longshanks", "Giraffe"],
  walk: ["Brawler", "Bruiser", "Scrapper", "Champ"],
};

/** A name from a fighter's shape, and its body's main color only as decoration. */
export function stockName(stats: FighterStats, strokes: Stroke[], seed: number): string {
  const rng = createRng(seed ^ 0x165667b1);
  const inks = new Map<number, number>();
  for (const s of strokes)
    if (partOf(s) === "body" && s.c !== 0) inks.set(s.c, (inks.get(s.c) ?? 0) + s.p.length);
  const color = [...inks.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const adjectives: string[] = [];
  if (stats.noodle) adjectives.push("Noodly", "Wobbly");
  if (stats.topples) adjectives.push("Towering", "Lanky");
  if (stats.mass >= 2.5) adjectives.push("Mighty", "Chonky", "Massive");
  if (stats.mass <= 0.7) adjectives.push("Itty-Bitty", "Tiny");
  if (stats.weaponInk > 15000) adjectives.push("Heavily Armed", "Dangerous");
  if (stats.arms >= 3) adjectives.push("Many-Armed", "Grabby");
  if (stats.arms === 0 && !stats.weaponInk) adjectives.push("Armless", "Huggable");
  if (stats.speed >= 14) adjectives.push("Zippy", "Speedy");
  if (color !== undefined) adjectives.push(COLOR_WORDS[color] ?? "Mystery");
  if (!adjectives.length) adjectives.push("Sir", "Captain", "Doctor");
  const noun = rng.pick(NAME_WORDS[stats.style]);
  const title =
    rng.next() < 0.25 && stats.weaponInk ? ` the ${rng.pick(["Bold", "Pointy", "Unwise", "Terrible"])}` : "";
  return `${rng.pick(adjectives)} ${noun}${title}`.slice(0, 24);
}

// Drawn fighters for players who run out of time, bots and the training dummy

const BODY_COLORS = ["coral", "sun", "teal", "sky", "grape", "pink", "gray"];

/**
 * A random fighter in `brick shapes` commands: one of a few builds (a biped, a spider, a blob, a noodle, a tank) with
 * random proportions, colors and gear, always with a body.
 */
export function randomFighterShapes(random: () => number): string {
  const r = (lo: number, hi: number) => Math.round(lo + random() * (hi - lo));
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]!;
  const color = pick(BODY_COLORS);
  const lines: string[] = [];
  const face = (x: number, y: number, gap: number) =>
    lines.push("color ink", "size thick", `dot ${x - gap} ${y}`, `dot ${x + gap} ${y}`);
  const build = pick(["biped", "spider", "blob", "noodle", "tank"]);
  const ground = 900;
  if (build === "biped") {
    const rx = r(110, 180);
    const ry = r(110, 170);
    const cy = r(430, 520);
    lines.push(
      "part body",
      `color ${color}`,
      `fill ellipse 500 ${cy} ${rx} ${ry}`,
      "color ink",
      "size thick",
      `ellipse 500 ${cy} ${rx} ${ry}`,
    );
    face(500, cy - 30, 40);
    lines.push(
      "part legs",
      "color ink",
      "size thick",
      `line ${500 - rx / 2} ${cy + ry - 10} ${500 - rx / 2 - r(0, 40)} ${ground}`,
      `line ${500 + rx / 2} ${cy + ry - 10} ${500 + rx / 2 + r(0, 40)} ${ground}`,
    );
    const arm = r(90, 220);
    lines.push(
      "part arms",
      `line ${500 - rx} ${cy} ${500 - rx - arm * 0.6} ${cy + arm * 0.5}`,
      `line ${500 + rx} ${cy} ${500 + rx + arm} ${cy - r(0, 80)}`,
    );
    if (random() < 0.6) {
      const hx = 500 + rx + arm;
      lines.push(
        "part weapon",
        `color ${pick(["gray", "sun", "ink"])}`,
        `size ${pick(["thick", "huge"])}`,
        `line ${hx} ${cy} ${hx + r(20, 80)} ${cy - r(150, 300)}`,
      );
    }
  } else if (build === "spider") {
    const rad = r(90, 150);
    const cy = r(520, 600);
    const legs = r(3, 4) * 2;
    lines.push(
      "part body",
      `color ${color}`,
      `fill circle 500 ${cy} ${rad}`,
      "color ink",
      "size thick",
      `circle 500 ${cy} ${rad}`,
    );
    face(500, cy - 20, 35);
    lines.push("part legs", "color ink", "size medium");
    for (let i = 0; i < legs; i++) {
      const side = i % 2 ? 1 : -1;
      const k = Math.floor(i / 2);
      const x = 500 + side * rad * (0.4 + 0.15 * k);
      lines.push(
        `curve ${x} ${cy + rad * 0.6} ${x + side * r(80, 160)} ${cy + r(-40, 40)} ${x + side * r(60, 220)} ${ground}`,
      );
    }
    if (random() < 0.5)
      lines.push(
        "part arms",
        "size thick",
        `line ${500 + rad} ${cy - rad / 2} ${500 + rad + r(60, 160)} ${cy - rad}`,
      );
  } else if (build === "blob") {
    const rad = r(150, 260);
    const cy = ground - rad;
    lines.push(
      "part body",
      `color ${color}`,
      `fill circle 500 ${cy} ${rad}`,
      "color ink",
      "size thick",
      `circle 500 ${cy} ${rad}`,
    );
    face(500, cy - rad / 3, rad / 3);
    if (random() < 0.7) {
      const arm = r(60, 160);
      lines.push("part arms", "size thick", `line ${500 + rad} ${cy} ${500 + rad + arm} ${cy - arm / 2}`);
      if (random() < 0.5) lines.push(`line ${500 - rad} ${cy} ${500 - rad - arm} ${cy - arm / 2}`);
    }
  } else if (build === "noodle") {
    const w = r(50, 90);
    const h = r(380, 520);
    const top = ground - h - r(0, 220);
    lines.push(
      "part body",
      `color ${color}`,
      `fill rect ${500 - w / 2} ${top} ${w} ${h}`,
      "color ink",
      "size thick",
      `rect ${500 - w / 2} ${top} ${w} ${h}`,
    );
    face(500, top + 40, 14);
    // Some noodles have no legs at all, and hop.
    if (random() < 0.7)
      lines.push(
        "part legs",
        "size thick",
        `line ${500 - w / 4} ${top + h} ${500 - w / 2 - r(10, 60)} ${ground}`,
        `line ${500 + w / 4} ${top + h} ${500 + w / 2 + r(10, 60)} ${ground}`,
      );
    const arm = r(160, 300);
    lines.push("part arms", `line ${500 + w / 2} ${top + 80} ${500 + w / 2 + arm} ${top + 80 - r(0, 120)}`);
    if (random() < 0.6) {
      const hx = 500 + w / 2 + arm;
      lines.push(
        "part weapon",
        "color gray",
        `fill rect ${hx - 40} ${top - 120} 80 ${r(60, 110)}`,
        "color ink",
        "size thick",
        `line ${hx} ${top + 80} ${hx} ${top - 60}`,
      );
    }
  } else {
    const w = r(320, 460);
    const h = r(130, 200);
    const top = ground - h - r(70, 120);
    lines.push(
      "part body",
      `color ${color}`,
      `fill rect ${500 - w / 2} ${top} ${w} ${h}`,
      "color ink",
      "size thick",
      `rect ${500 - w / 2} ${top} ${w} ${h}`,
    );
    face(500 + w / 4, top + 40, 25);
    lines.push("part legs", "size thick");
    for (const f of [-0.4, -0.15, 0.15, 0.4])
      lines.push(`line ${500 + w * f} ${top + h} ${500 + w * f} ${ground}`);
    if (random() < 0.8) {
      lines.push(
        "part weapon",
        `color ${pick(["sky", "sun", "gray"])}`,
        "size huge",
        `line ${500 + w / 2 - 20} ${top + h / 2} ${500 + w / 2 + r(140, 320)} ${top + h / 2 - r(0, 60)}`,
      );
    }
  }
  return lines.join("; ");
}

/** The house fighter that fills an odd seat in the duels: a gray sandbag with no arms or legs. */
export const DUMMY_SHAPES =
  "part body; color gray; fill rect 420 560 160 320; color ink; size thick; rect 420 560 160 320; line 420 660 580 660; line 420 780 580 780; dot 470 610; dot 530 610";

export function shapesToFighter(source: string, random: () => number): Stroke[] {
  return drawShapes(source, random, DOODLE_LIMITS);
}
