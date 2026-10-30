import { DRAW_COLORS, DRAW_SIZES, fillPathData, shapePathData, type Stroke } from "@brick/game";
import { getStroke } from "perfect-freehand";
import type { SVGProps } from "react";

const average = (a: number, b: number) => (a + b) / 2;

/** Outline points from perfect-freehand as a closed SVG path. */
function svgPath(outline: number[][]): string {
  if (outline.length < 4) return "";
  let a = outline[0]!;
  let b = outline[1]!;
  const c = outline[2]!;
  let d = `M${a[0]!.toFixed(1)},${a[1]!.toFixed(1)} Q${b[0]!.toFixed(1)},${b[1]!.toFixed(1)} ${average(b[0]!, c[0]!).toFixed(1)},${average(b[1]!, c[1]!).toFixed(1)} T`;
  for (let i = 2; i < outline.length - 1; i++) {
    a = outline[i]!;
    b = outline[i + 1]!;
    d += `${average(a[0]!, b[0]!).toFixed(1)},${average(a[1]!, b[1]!).toFixed(1)} `;
  }
  return `${d}Z`;
}

/**
 * The filled outline of a stroke in canvas units. Pens use their real pressure; everything else
 * (mouse, touch, stored drawings) simulates it from speed.
 */
export function strokePath(points: number[][], sizeIndex: number, { pen = false, done = true } = {}): string {
  return svgPath(
    getStroke(points, {
      size: DRAW_SIZES[sizeIndex] ?? DRAW_SIZES[1],
      thinning: 0.55,
      smoothing: 0.5,
      streamline: 0.4,
      simulatePressure: !pen,
      last: done,
    }),
  );
}

/** A stored stroke's flat `[x, y, x, y, ...]` list as points. */
export function unflatten(p: number[]): number[][] {
  const points: number[][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) points.push([p[i]!, p[i + 1]!]);
  return points;
}

/** How one stored stroke paints: its path data, its colour, and whether the path is filled or outlined. */
export interface StrokePaint {
  d: string;
  color: string;
  /** `fill` for a filled outline (lines), `evenodd` for a bucket fill whose inner rings cut holes, `stroke` for a shape. */
  mode: "fill" | "evenodd" | "stroke";
  /** The outline's width, for `stroke`. */
  width: number;
}

/** How one stored stroke paints, for SVG and canvas alike. */
export function strokePaint(s: Stroke): StrokePaint {
  const color = DRAW_COLORS[s.c] ?? DRAW_COLORS[0]!;
  if (s.k === "fill") return { d: fillPathData(s.p), color, mode: "evenodd", width: 0 };
  if (s.k === "shape") return { d: shapePathData(s.p), color, mode: "stroke", width: DRAW_SIZES[s.w] ?? DRAW_SIZES[1]! };
  return { d: strokePath(unflatten(s.p), s.w), color, mode: "fill", width: 0 };
}

/** How one stored stroke draws as an SVG path. */
export function strokeSvgProps(s: Stroke): SVGProps<SVGPathElement> {
  const { d, color, mode, width } = strokePaint(s);
  if (mode === "evenodd") return { d, fill: color, fillRule: "evenodd" };
  if (mode === "stroke") return { d, fill: "none", stroke: color, strokeWidth: width, strokeLinejoin: "round", strokeLinecap: "round" };
  return { d, fill: color };
}
