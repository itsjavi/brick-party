import { CANVAS_UNITS, DRAW_COLORS, DRAW_SIZES, fillPathData, shapePathData } from "@brick/game";
import { closeRing, simplifyPoints, type LocalStroke } from "./simplify";

/** Cells per side of the raster the bucket floods. Each is 2 canvas units, fine enough that the thinnest line walls it. */
export const FILL_CELLS = 500;
/** A line covering this much of a cell (alpha, 0 to 255) is a wall, whatever its color. */
const LINE_ALPHA = 80;
/** How far apart two colors may be, summed over red, green and blue, and still count as one area. */
const COLOR_TOLERANCE = 48;
/**
 * How far a traced outline may stray from the cell edges, in cells. A full cell straightens even the long stair steps of
 * a nearly upright edge, and the outline still ends under the line it meets.
 */
const TRACE_EPSILON = 1;

/**
 * The cells the bucket fills from cell `(x, y)`: those joined to it edge to edge that have its color and no line on
 * them. `colors` is the drawing without its lines, `lines` is its lines alone (only alpha counts), both RGBA rasters of
 * `size` by `size` cells. Null when the tap lands on a line.
 */
export function floodCells(colors: ArrayLike<number>, lines: ArrayLike<number>, size: number, x: number, y: number): Uint8Array | null {
  const seed = y * size + x;
  if (lines[seed * 4 + 3]! >= LINE_ALPHA) return null;
  const r = colors[seed * 4]!;
  const g = colors[seed * 4 + 1]!;
  const b = colors[seed * 4 + 2]!;
  const mask = new Uint8Array(size * size);
  const stack = new Int32Array(size * size);
  let top = 0;
  const visit = (i: number) => {
    if (mask[i] || lines[i * 4 + 3]! >= LINE_ALPHA) return;
    if (Math.abs(colors[i * 4]! - r) + Math.abs(colors[i * 4 + 1]! - g) + Math.abs(colors[i * 4 + 2]! - b) > COLOR_TOLERANCE) return;
    mask[i] = 1;
    stack[top++] = i;
  };
  visit(seed);
  while (top) {
    const i = stack[--top]!;
    const cx = i % size;
    if (cx > 0) visit(i - 1);
    if (cx < size - 1) visit(i + 1);
    if (i >= size) visit(i - size);
    if (i < size * (size - 1)) visit(i + size);
  }
  return mask;
}

/** Grows an area by one cell all round, so it tucks under the lines around it instead of leaving a hairline gap. */
export function grow(mask: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) out[ny * size + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * The outlines of an area, holes included, as closed rings in canvas units. Walks the cell edges between inside and
 * outside, then joins the middles of those edges, which turns stair steps into slopes before simplifying. Drawn with
 * the even-odd rule, the rings cover the area.
 */
export function traceRings(mask: Uint8Array, size: number, epsilon = TRACE_EPSILON): [number, number][][] {
  // Directed edges between grid corners, clockwise around each inside cell. A corner has at most two going out.
  const corners = size + 1;
  const out1 = new Int32Array(corners * corners).fill(-1);
  const out2 = new Int32Array(corners * corners).fill(-1);
  const edge = (from: number, to: number) => {
    if (out1[from] === -1) out1[from] = to;
    else out2[from] = to;
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && mask[y * size + x] === 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      const tl = y * corners + x;
      if (!inside(x, y - 1)) edge(tl, tl + 1);
      if (!inside(x + 1, y)) edge(tl + 1, tl + 1 + corners);
      if (!inside(x, y + 1)) edge(tl + 1 + corners, tl + corners);
      if (!inside(x - 1, y)) edge(tl + corners, tl);
    }
  }

  const scale = CANVAS_UNITS / size;
  const rings: [number, number][][] = [];
  for (let start = 0; start < out1.length; start++) {
    while (out1[start] !== -1) {
      // Every corner has as many edges in as out, so a walk can only end where it started.
      const walk: number[] = [];
      let at = start;
      do {
        walk.push(at);
        const next = out1[at]!;
        out1[at] = out2[at]!;
        out2[at] = -1;
        at = next;
      } while (at !== start);
      const ring = closeRing(smoothRing(turns(middles(walk, corners)), epsilon).map(([x, y]) => [x * scale, y * scale]));
      if (ring) rings.push(ring);
    }
  }
  return rings;
}

/** The middle of each cell edge along a closed walk of grid corners. */
function middles(walk: number[], corners: number): [number, number][] {
  return walk.map((v, i) => {
    const next = walk[(i + 1) % walk.length]!;
    return [((v % corners) + (next % corners)) / 2, (Math.floor(v / corners) + Math.floor(next / corners)) / 2];
  });
}

/** The points where a closed path turns, without the ones in the middle of a straight run. */
function turns(points: [number, number][]): [number, number][] {
  return points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length]!;
    const b = points[(i + 1) % points.length]!;
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
  });
}

/** Simplifies a closed ring (given without its closing point), so stair steps become slopes. */
function smoothRing(ring: [number, number][], epsilon: number): (readonly [number, number])[] {
  if (ring.length < 4) return ring;
  return simplifyPoints([...ring, ring[0]!], epsilon);
}

/**
 * What the bucket adds when tapped at `(x, y)` in canvas units with color `c`: a fill of the area under the tap, or
 * null when the tap is on a line or the area already has that color. `linePath` is a freehand line's outline.
 */
export function bucketFill(strokes: LocalStroke[], x: number, y: number, c: number, linePath: (stroke: LocalStroke) => string): LocalStroke | null {
  const size = FILL_CELLS;
  const flat = (s: LocalStroke) => s.points.flatMap(([px, py]) => [px!, py!]);
  const raster = (paint: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.scale(size / CANVAS_UNITS, size / CANVAS_UNITS);
    paint(ctx);
    return ctx.getImageData(0, 0, size, size).data;
  };
  const colors = raster((ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_UNITS, CANVAS_UNITS);
    for (const s of strokes) {
      if (s.k !== "fill") continue;
      ctx.fillStyle = DRAW_COLORS[s.c] ?? DRAW_COLORS[0]!;
      ctx.fill(new Path2D(fillPathData(flat(s))), "evenodd");
    }
  });
  const lines = raster((ctx) => {
    ctx.fillStyle = ctx.strokeStyle = "#000000";
    ctx.lineJoin = ctx.lineCap = "round";
    for (const s of strokes) {
      if (s.k === "fill") continue;
      if (s.k === "shape") {
        ctx.lineWidth = DRAW_SIZES[s.w] ?? DRAW_SIZES[1]!;
        ctx.stroke(new Path2D(shapePathData(flat(s))));
      } else ctx.fill(new Path2D(linePath(s)));
    }
  });

  const cx = Math.min(size - 1, Math.max(0, Math.floor((x / CANVAS_UNITS) * size)));
  const cy = Math.min(size - 1, Math.max(0, Math.floor((y / CANVAS_UNITS) * size)));
  const hex = DRAW_COLORS[c] ?? DRAW_COLORS[0]!;
  const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const seed = (cy * size + cx) * 4;
  if (target.reduce((d, v, i) => d + Math.abs(v - colors[seed + i]!), 0) <= COLOR_TOLERANCE) return null;

  const cells = floodCells(colors, lines, size, cx, cy);
  if (!cells) return null;
  const rings = traceRings(grow(cells, size), size);
  return rings.length ? { c, w: 0, k: "fill", points: rings.flat() } : null;
}
