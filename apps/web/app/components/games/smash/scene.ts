import {
  ACT,
  ATTACK_TICKS,
  FLOOR_SCALE,
  SMASH_SCALE,
  WORLD,
  type PowerKind,
  type SmashBody,
  type SmashEvent,
  type SmashSpec,
} from "@brick/game";
import type { SfxName } from "../../../lib/audio";
import type { IconName } from "../../../lib/icons";
import type { Moment } from "../doodle/pose";

/**
 * The pure parts of drawing a Doodle Smash fight: how a body poses, where the camera looks, and what events say and
 * sound like. `renderer.ts` draws with them.
 */

/** The visible world: a little wider than the stage, y down from the top (the world's own y is up from the bottom). */
export const VIEW = { x: -80, width: WORLD.width + 160, height: WORLD.height };
export const ASPECT = VIEW.width / VIEW.height;
/** The camera never zooms in further than this many world units across, so fighters stay big but in context. */
export const CAMERA_MIN_WIDTH = 760;
/** Room kept around the fighters the camera frames. */
export const CAMERA_PAD = 230;
/** The share of the gap to its target the camera closes each frame. */
export const CAMERA_EASE = 0.08;
/** The world's y (up from the bottom) as the picture's (down from the top). */
export const sy = (y: number) => WORLD.height - y;

/** Each power-up's icon, on the stage and in the controls help. */
export const POWER_ICONS: Record<PowerKind, IconName> = {
  heal: "heart",
  speed: "bolt",
  power: "burst",
  shield: "shield",
};
const POWER_WORDS: Record<PowerKind, string> = {
  heal: "HEALED!",
  speed: "SPEED!",
  power: "BIG HIT READY!",
  shield: "SHIELD UP!",
};
const HIT_WORDS = ["POW!", "BAM!", "WHAM!", "BONK!", "SMASH!"];

/** A colour for damage %: white when fresh, through yellow and orange to red as it climbs. */
export function damageColor(dmg: number): string {
  if (dmg < 30) return "#ffffff";
  if (dmg < 70) return "#ffe066";
  if (dmg < 110) return "#ffa94d";
  if (dmg < 160) return "#ff6b57";
  return "#d6336c";
}

/** Sounds for events, by kind. */
export function eventSound(e: SmashEvent): SfxName | null {
  switch (e.k) {
    case "hit":
      return e.p === "big" ? "smash" : "hit";
    case "block":
      return "shield";
    case "break":
      return "shatter";
    case "ko":
      return "ko";
    case "power":
      return "powerUp";
    case "shot":
      return "laser";
    case "respawn":
      return "drop";
  }
}

export type EffectKind = "hit" | "big" | "block" | "break" | "ko" | "power" | "respawn";

/** How an event shows on screen: the kind of burst and the words over it. */
export function eventEffect(e: SmashEvent): { kind: EffectKind; text: string } {
  const kind: EffectKind = e.k === "hit" && e.p === "big" ? "big" : (e.k as EffectKind);
  const text =
    e.k === "hit"
      ? e.p === "big"
        ? `${HIT_WORDS[e.n % HIT_WORDS.length]} ${e.d}%`
        : `${e.d}%`
      : e.k === "block"
        ? e.d > 0
          ? `${e.d}%`
          : "BLOCK"
        : e.k === "break"
          ? "SHIELD BROKEN!"
          : e.k === "ko"
            ? e.p === "out"
              ? "OUT!"
              : "KO!"
            : e.k === "power"
              ? (POWER_WORDS[e.p as PowerKind] ?? "")
              : "";
  return { kind, text };
}

/** World units walked, as the floor units a drawing's gait is measured in: so feet keep pace with the ground. */
export const gaitDistance = (dx: number) => (Math.abs(dx) / SMASH_SCALE) * FLOOR_SCALE;

/**
 * What the drawing should be doing, for the posing Doodle Champions' fighters use (`poseAt`). Its `y` is the height
 * above the floor there; here the fighter stands on platforms at any height, so it's 0 on a platform and 1 in the air
 * (the world's own height would leave every fighter on a ledge in its jumping pose).
 */
export function momentOf(b: SmashBody, dist: number, t: number, hurtAgo: number): Moment {
  const act =
    b.atk > 0
      ? ACT.attack
      : b.stun > 0
        ? ACT.hurt
        : b.gr < 0
          ? ACT.air
          : Math.abs(b.vx) > 1
            ? ACT.move
            : ACT.idle;
  return {
    x: b.x,
    y: b.gr >= 0 ? 0 : 1,
    act,
    face: b.face,
    dist,
    t,
    // Doodle Champions' swing takes four of its 100 ms ticks; an attack here takes `ATTACK_TICKS` of 50 ms.
    sinceAttack: b.atk > 0 ? ((ATTACK_TICKS - b.atk) / ATTACK_TICKS) * 4 : Infinity,
    sinceHurt: hurtAgo / 100,
    sinceKo: -Infinity,
  };
}

/** What the camera shows: its left and top edges and its width, in the picture's units (its height follows `ASPECT`). */
export interface Camera {
  x: number;
  y: number;
  w: number;
}

/** The whole stage. */
export const wideCamera = (): Camera => ({ x: VIEW.x, y: 0, w: VIEW.width });

/**
 * Where the camera wants to be, into `out`: framing every fighter in play, Smash-style, zoomed in when they're close
 * together but never past `CAMERA_MIN_WIDTH`; the whole stage when nobody's in play or the fight is over.
 */
export function frameCamera(
  out: Camera,
  bodies: readonly SmashBody[],
  specs: readonly (SmashSpec | undefined)[],
  over: boolean,
): Camera {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]!;
    const spec = specs[i];
    if (!spec || b.out !== 0) continue;
    x0 = Math.min(x0, b.x - spec.w);
    x1 = Math.max(x1, b.x + spec.w);
    y0 = Math.min(y0, sy(b.y + spec.h));
    y1 = Math.max(y1, sy(b.y));
  }
  out.x = VIEW.x;
  out.y = 0;
  out.w = VIEW.width;
  if (x0 < x1 && !over) {
    const w = Math.min(
      VIEW.width,
      Math.max(CAMERA_MIN_WIDTH, x1 - x0 + 2 * CAMERA_PAD, (y1 - y0 + 2 * CAMERA_PAD) * ASPECT),
    );
    const h = w / ASPECT;
    out.w = w;
    out.x = Math.max(VIEW.x, Math.min(VIEW.x + VIEW.width - w, (x0 + x1) / 2 - w / 2));
    out.y = Math.max(0, Math.min(VIEW.height - h, (y0 + y1) / 2 - h / 2 - h * 0.08));
  }
  return out;
}

/** Moves the camera `view` a step toward `target`. */
export function easeCamera(view: Camera, target: Camera, ease = CAMERA_EASE): Camera {
  view.x += (target.x - view.x) * ease;
  view.y += (target.y - view.y) * ease;
  view.w += (target.w - view.w) * ease;
  return view;
}

/** One fighter's line on the scoreboard. */
export interface CardRow {
  i: number;
  lives: number;
  kos: number;
  dmg: number;
}

/** Who's winning, best first: most lives, then most knockouts, then least damage. */
export function rank(bodies: readonly SmashBody[], kos: readonly number[]): number[] {
  return bodies
    .map((b, i): CardRow => ({ i, lives: Math.max(0, b.lives), kos: kos[i] ?? 0, dmg: b.dmg }))
    .sort((a, b) => b.lives - a.lives || b.kos - a.kos || a.dmg - b.dmg)
    .map((r) => r.i);
}
