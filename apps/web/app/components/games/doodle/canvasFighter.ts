import { paintOrder, type FighterRig, type Stroke } from "@brick/game";
import { strokePaint, type StrokePaint } from "../skip-logic/paths";
import {
  affine,
  bodyTransform,
  copy,
  limbTransform,
  rotateAround,
  type Affine,
  type Placement,
} from "./affine";
import type { Pose } from "./pose";

/**
 * Fighters drawn on a canvas: each drawing's strokes turned into `Path2D`s once, split into the parts that move, and
 * drawn at a pose with the same transform chain as the SVG `FighterFigure`.
 */

/** A fighter's strokes by the part they move with: legs behind, then the body, then arms with what they hold. */
export interface PartIndexes {
  body: number[];
  /** One list per `rig.limbs` entry. */
  limbs: number[][];
  weapon: number[] | null;
}

/** Which strokes go in which part, each part in paint order (fills under lines). */
export function partIndexes(
  strokes: Pick<Stroke, "k">[],
  rig: Pick<FighterRig, "limbs" | "weapon">,
): PartIndexes {
  const order = (indexes: number[]) =>
    paintOrder(indexes.map((i) => ({ i, k: strokes[i]?.k }))).map(({ i }) => i);
  const used = new Set([...rig.limbs.flatMap((l) => l.strokes), ...(rig.weapon?.strokes ?? [])]);
  const body = strokes.flatMap((_, i) => (used.has(i) ? [] : [i]));
  return {
    body: order(body),
    limbs: rig.limbs.map((limb) => order(limb.strokes)),
    weapon: rig.weapon ? order(rig.weapon.strokes) : null,
  };
}

interface Paint extends Omit<StrokePaint, "d"> {
  path: Path2D;
}

/** A fighter ready to draw: its paths per part. */
export interface CanvasFighter {
  rig: FighterRig;
  body: Paint[];
  limbs: Paint[][];
  weapon: Paint[] | null;
}

const cache = new WeakMap<Stroke[], CanvasFighter>();

/** A drawing's parts as paths, worked out once per drawing (and rig). */
export function canvasFighter(fighter: { strokes: Stroke[]; rig: FighterRig }): CanvasFighter {
  const kept = cache.get(fighter.strokes);
  if (kept && kept.rig === fighter.rig) return kept;
  const paints = fighter.strokes.map((s) => {
    const { d, ...rest } = strokePaint(s);
    return { ...rest, path: new Path2D(d) };
  });
  const parts = partIndexes(fighter.strokes, fighter.rig);
  const pick = (indexes: number[]) => indexes.map((i) => paints[i]!);
  const made: CanvasFighter = {
    rig: fighter.rig,
    body: pick(parts.body),
    limbs: parts.limbs.map(pick),
    weapon: parts.weapon ? pick(parts.weapon) : null,
  };
  cache.set(fighter.strokes, made);
  return made;
}

// Scratch transforms, so drawing allocates nothing.
const bodyM = affine();
const partM = affine();

function setTransform(ctx: CanvasRenderingContext2D, m: Affine) {
  ctx.setTransform(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!);
}

/** Paints a part's paths; `tint` paints them all in one colour instead (the hit flash). */
function paint(ctx: CanvasRenderingContext2D, paints: Paint[], tint: string | null) {
  for (const p of paints) {
    const color = tint ?? p.color;
    if (p.mode === "stroke") {
      ctx.strokeStyle = color;
      ctx.lineWidth = p.width;
      ctx.stroke(p.path);
    } else {
      ctx.fillStyle = color;
      ctx.fill(p.path, p.mode === "evenodd" ? "evenodd" : "nonzero");
    }
  }
}

function drawParts(ctx: CanvasRenderingContext2D, f: CanvasFighter, pose: Pose, tint: string | null) {
  const { rig } = f;
  const held = rig.weapon?.arm ?? null;
  for (let i = 0; i < rig.limbs.length; i++) {
    const limb = rig.limbs[i]!;
    if (limb.part !== "legs") continue;
    setTransform(ctx, limbTransform(partM, bodyM, limb.pivot, pose.limbs[i] ?? 0));
    paint(ctx, f.limbs[i]!, tint);
  }
  setTransform(ctx, bodyM);
  paint(ctx, f.body, tint);
  if (rig.weapon && f.weapon && held === null) {
    copy(partM, bodyM);
    setTransform(ctx, rotateAround(partM, pose.weapon, rig.weapon.pivot[0], rig.weapon.pivot[1]));
    paint(ctx, f.weapon, tint);
  }
  for (let i = 0; i < rig.limbs.length; i++) {
    const limb = rig.limbs[i]!;
    if (limb.part !== "arms") continue;
    setTransform(ctx, limbTransform(partM, bodyM, limb.pivot, pose.limbs[i] ?? 0));
    paint(ctx, f.limbs[i]!, tint);
    if (held === i && f.weapon) paint(ctx, f.weapon, tint);
  }
}

/** How strong the white of the hit flash is, at full flash. */
const FLASH = 0.7;

/**
 * Draws a fighter at `pose`, placed by `at`, on top of `base` (the canvas's own transform, device pixels included).
 * `alpha` multiplies the pose's opacity. Leaves the canvas's transform changed: callers set theirs again after.
 */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  base: Affine,
  f: CanvasFighter,
  pose: Pose,
  at: Placement,
  alpha = 1,
) {
  copy(bodyM, base);
  bodyTransform(bodyM, f.rig, pose, at);
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha * pose.opacity;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  drawParts(ctx, f, pose, null);
  // The hit flash: the same shapes again in white over the colours, instead of the SVG's brightness filter.
  if (pose.flash > 0) {
    ctx.globalAlpha = before * alpha * pose.opacity * pose.flash * FLASH;
    drawParts(ctx, f, pose, "#ffffff");
  }
  ctx.globalAlpha = before;
}
