import { CANVAS_UNITS, fillRings, type Stroke } from "@brick/game";

/** A stroke as drawn on this device: canvas-unit points with optional pen pressure. */
export interface LocalStroke {
  c: number;
  w: number;
  /** `[x, y, pressure?]` in canvas units. A fill's rings follow one another, each closed (see `Stroke.k`). */
  points: number[][];
  pen?: boolean;
  k?: Stroke["k"];
  /** The fighter part it belongs to, in Doodle Champions. */
  t?: Stroke["t"];
}

type Pt = readonly [number, number];

/** The server's limits for one drawing (mirrors `skipLogicActionSchema`). */
export const DRAWING_LIMITS = { maxStrokes: 400, maxValues: 12000 };

function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / length;
}

/** Ramer-Douglas-Peucker, iterative so long strokes can't overflow the stack. */
export function simplifyPoints(points: readonly Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i]!, points[start]!, points[end]!);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const toUnit = (n: number) => Math.min(CANVAS_UNITS, Math.max(0, Math.round(n)));

/**
 * A fill ring as stored: integer points, no point twice in a row, at least 3 corners, and ending on its first point
 * without touching it anywhere else, so `fillRings` can tell where it ends. Null when it's too small to keep.
 */
export function closeRing(points: readonly (readonly number[])[]): [number, number][] | null {
  const ring: [number, number][] = [];
  for (const [x, y] of points) {
    const last = ring.at(-1);
    const point: [number, number] = [toUnit(x!), toUnit(y!)];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) ring.push(point);
  }
  const [sx, sy] = ring[0] ?? [0, 0];
  while (ring.length > 1 && ring.at(-1)![0] === sx && ring.at(-1)![1] === sy) ring.pop();
  if (ring.length < 3) return null;
  for (let i = 1; i < ring.length; i++) {
    if (ring[i]![0] === sx && ring[i]![1] === sy) ring[i] = [sx < CANVAS_UNITS ? sx + 1 : sx - 1, sy];
  }
  return [...ring, [sx, sy]];
}

function packFill(stroke: LocalStroke, epsilon: number): Stroke {
  const rings = fillRings(stroke.points.flatMap(([x, y]) => [x!, y!]))
    .map((ring) => closeRing(simplifyPoints(ring, epsilon)))
    .filter((ring) => ring !== null);
  return withPart({ c: stroke.c, w: stroke.w, p: rings.flat(2), k: "fill" }, stroke);
}

const withPart = (packed: Stroke, stroke: LocalStroke): Stroke => (stroke.t ? { ...packed, t: stroke.t } : packed);

function packStroke(stroke: LocalStroke, epsilon: number): Stroke {
  if (stroke.k === "fill") return packFill(stroke, epsilon);
  const simplified = simplifyPoints(
    stroke.points.map((p) => [p[0]!, p[1]!] as const),
    epsilon,
  );
  const p: number[] = [];
  for (const [x, y] of simplified) {
    const ix = toUnit(x);
    const iy = toUnit(y);
    if (p.length >= 2 && p[p.length - 2] === ix && p[p.length - 1] === iy) continue;
    p.push(ix, iy);
  }
  return withPart(stroke.k ? { c: stroke.c, w: stroke.w, p, k: stroke.k } : { c: stroke.c, w: stroke.w, p }, stroke);
}

const valueCount = (strokes: Stroke[]) => strokes.reduce((n, s) => n + s.p.length, 0);

/**
 * Turns local strokes into the compact payload the server accepts: integer canvas units,
 * simplified harder and harder until the drawing fits the limits.
 */
export function packStrokes(strokes: LocalStroke[], limits = DRAWING_LIMITS): Stroke[] {
  const usable = strokes.filter((s) => s.points.length > 0).slice(0, limits.maxStrokes);
  const tolerances = [0.75, 1.5, 3, 6, 12, 24];
  // A fill can simplify down to nothing; the server wants at least one point per stroke.
  const pack = (epsilon: number) => usable.map((s) => packStroke(s, epsilon)).filter((s) => s.p.length >= 2);
  for (const epsilon of tolerances) {
    const packed = pack(epsilon);
    if (valueCount(packed) <= limits.maxValues) return packed;
  }
  // Still too detailed: keep whole strokes, in drawing order, while they fit.
  const kept: Stroke[] = [];
  let total = 0;
  for (const stroke of pack(tolerances.at(-1)!)) {
    if (total + stroke.p.length > limits.maxValues) break;
    kept.push(stroke);
    total += stroke.p.length;
  }
  return kept;
}
