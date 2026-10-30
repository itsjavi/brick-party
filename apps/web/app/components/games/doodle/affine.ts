import type { FighterRig } from "@brick/game";
import type { Pose } from "./pose";

/**
 * 2D affine transforms in the canvas's own order, `[a, b, c, d, e, f]`: a point `(x, y)` goes to
 * `(a·x + c·y + e, b·x + d·y + f)`, which `ctx.setTransform(a, b, c, d, e, f)` takes as is. Every operation multiplies
 * on the right, like `ctx.translate` and friends and like SVG's `transform` lists read left to right, and works in
 * place, so drawing a frame allocates nothing.
 */
export type Affine = Float64Array;

const RAD = Math.PI / 180;

export function affine(): Affine {
  return Float64Array.of(1, 0, 0, 1, 0, 0);
}

export function identity(m: Affine): Affine {
  m[0] = 1;
  m[1] = 0;
  m[2] = 0;
  m[3] = 1;
  m[4] = 0;
  m[5] = 0;
  return m;
}

export function copy(to: Affine, from: Affine): Affine {
  to.set(from);
  return to;
}

export function set(m: Affine, a: number, b: number, c: number, d: number, e: number, f: number): Affine {
  m[0] = a;
  m[1] = b;
  m[2] = c;
  m[3] = d;
  m[4] = e;
  m[5] = f;
  return m;
}

export function translate(m: Affine, x: number, y: number): Affine {
  m[4] = m[4]! + m[0]! * x + m[2]! * y;
  m[5] = m[5]! + m[1]! * x + m[3]! * y;
  return m;
}

export function scale(m: Affine, sx: number, sy = sx): Affine {
  m[0] = m[0]! * sx;
  m[1] = m[1]! * sx;
  m[2] = m[2]! * sy;
  m[3] = m[3]! * sy;
  return m;
}

/** Clockwise on screen (y down) by `deg` degrees, like SVG's `rotate(deg)`. */
export function rotate(m: Affine, deg: number): Affine {
  if (!deg) return m;
  const cos = Math.cos(deg * RAD);
  const sin = Math.sin(deg * RAD);
  const a = m[0]!;
  const b = m[1]!;
  const c = m[2]!;
  const d = m[3]!;
  m[0] = a * cos + c * sin;
  m[1] = b * cos + d * sin;
  m[2] = c * cos - a * sin;
  m[3] = d * cos - b * sin;
  return m;
}

/** SVG's `rotate(deg px py)`: around the point `(px, py)`. */
export function rotateAround(m: Affine, deg: number, px: number, py: number): Affine {
  if (!deg) return m;
  translate(m, px, py);
  rotate(m, deg);
  return translate(m, -px, -py);
}

/** SVG's `skewX(deg)`. */
export function skewX(m: Affine, deg: number): Affine {
  if (!deg) return m;
  const t = Math.tan(deg * RAD);
  m[2] = m[2]! + m[0]! * t;
  m[3] = m[3]! + m[1]! * t;
  return m;
}

/** `m` times `n`, into `out` (which may be either). */
export function multiply(out: Affine, m: Affine, n: Affine): Affine {
  const a = m[0]!;
  const b = m[1]!;
  const c = m[2]!;
  const d = m[3]!;
  const e = m[4]!;
  const f = m[5]!;
  const a2 = n[0]!;
  const b2 = n[1]!;
  const c2 = n[2]!;
  const d2 = n[3]!;
  const e2 = n[4]!;
  const f2 = n[5]!;
  out[0] = a * a2 + c * b2;
  out[1] = b * a2 + d * b2;
  out[2] = a * c2 + c * d2;
  out[3] = b * c2 + d * d2;
  out[4] = a * e2 + c * f2 + e;
  out[5] = b * e2 + d * f2 + f;
  return out;
}

/** Where `m` takes the point `(x, y)`. For tests and overlays; it allocates. */
export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
}

/** Where a fighter stands and how it's drawn: on the floor at `x`, `y` floor units up, facing `face`. */
export interface Placement {
  x: number;
  y: number;
  face: 1 | -1;
  /** The floor's height in the picture's units (y down). */
  floor: number;
  /** Picture units per drawing unit. */
  scale: number;
}

/**
 * The fighter's body transform, from its drawing's units to the picture's, onto `out` (which starts as the picture's
 * own transform): placed and flipped to face its way, then lifted, shaken, bobbed, turned around its center (or its
 * feet, falling over), squashed and skewed. The same chain as the SVG fighter's two nested groups.
 */
export function bodyTransform(out: Affine, rig: FighterRig, pose: Pose, at: Placement): Affine {
  const [cx, cy] = rig.center;
  const feet = rig.feet;
  const flip = at.face * (rig.facesRight ? 1 : -1);
  translate(out, at.x, at.floor - at.y - pose.lift);
  scale(out, flip * at.scale, at.scale);
  translate(out, -cx, -feet);
  translate(out, pose.jitter, pose.bob);
  if (pose.aroundFeet) rotateAround(out, pose.body, cx, feet);
  else rotateAround(out, pose.body, cx, cy);
  translate(out, cx, feet);
  scale(out, 1 / pose.squash, pose.squash);
  skewX(out, pose.skew);
  return translate(out, -cx, -feet);
}

/** A limb's transform, from the body's (`body`) into `out`: rotated by its pose angle around where it joins the body. */
export function limbTransform(out: Affine, body: Affine, pivot: readonly number[], deg: number): Affine {
  copy(out, body);
  return rotateAround(out, deg, pivot[0]!, pivot[1]!);
}
