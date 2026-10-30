import { fillRings, skipLogic } from "@brick/game";
import { describe, expect, test } from "vitest";
import { closeRing, packStrokes, simplifyPoints, type LocalStroke } from "./simplify";

describe("simplifyPoints", () => {
  test("collapses a straight line to its endpoints", () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 10, i * 5] as const);
    expect(simplifyPoints(line, 1)).toEqual([line[0], line[49]]);
  });

  test("keeps corners", () => {
    const corner = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100]] as const;
    expect(simplifyPoints(corner, 1)).toEqual([[0, 0], [100, 0], [100, 100]]);
  });

  test("leaves one- and two-point strokes alone", () => {
    expect(simplifyPoints([[3, 4]], 5)).toEqual([[3, 4]]);
    expect(simplifyPoints([[3, 4], [5, 6]], 5)).toEqual([[3, 4], [5, 6]]);
  });
});

describe("packStrokes", () => {
  const scribble = (n: number, seed = 1): LocalStroke => ({
    c: 2,
    w: 1,
    points: Array.from({ length: n }, (_, i) => [
      500 + 400 * Math.sin(i * 0.37 * seed),
      500 + 400 * Math.cos(i * 0.53 * seed),
      0.5,
    ]),
  });

  test("produces integer coordinates inside the canvas that the server accepts", () => {
    const strokes = [scribble(200), { c: 0, w: 3, points: [[-20, 1200.6]] }];
    const packed = packStrokes(strokes);
    for (const s of packed) for (const v of s.p) expect(Number.isInteger(v) && v >= 0 && v <= 1000).toBe(true);
    expect(packed[1]!.p).toEqual([0, 1000]);
    expect(skipLogic.actionSchema.safeParse({ type: "draw", strokes: packed }).success).toBe(true);
  });

  test("simplifies dense drawings until they fit the limits", () => {
    const strokes = Array.from({ length: 60 }, (_, i) => scribble(800, i + 1));
    const packed = packStrokes(strokes);
    expect(packed.reduce((n, s) => n + s.p.length, 0)).toBeLessThanOrEqual(12000);
    expect(skipLogic.actionSchema.safeParse({ type: "draw", strokes: packed }).success).toBe(true);
  });

  test("drops whole strokes past the stroke limit or when nothing else fits", () => {
    const many = Array.from({ length: 450 }, () => ({ c: 0, w: 0, points: [[1, 1], [2, 2]] }));
    expect(packStrokes(many)).toHaveLength(400);
    const tight = packStrokes([scribble(400, 2), scribble(400, 3)], { maxStrokes: 400, maxValues: 10 });
    expect(tight.reduce((n, s) => n + s.p.length, 0)).toBeLessThanOrEqual(10);
  });

  test("an empty canvas is an empty drawing", () => {
    expect(packStrokes([])).toEqual([]);
  });

  test("keeps shapes and fills, ring by ring", () => {
    const square = (x: number, size: number) => [[x, x], [x + size, x], [x + size, x + size], [x, x + size], [x, x]];
    const fill: LocalStroke = { c: 4, w: 0, k: "fill", points: [...square(100, 600), ...square(300, 200), ...square(990, 0.2)] };
    const shape: LocalStroke = { c: 0, w: 2, k: "shape", points: square(50, 100) };
    const [packedFill, packedShape] = packStrokes([fill, shape]);
    expect(packedShape).toEqual({ c: 0, w: 2, k: "shape", p: square(50, 100).flat() });
    expect(packedFill!.k).toBe("fill");
    // The speck too small to see is dropped; the outline and the hole stay.
    expect(fillRings(packedFill!.p)).toEqual([square(100, 600), square(300, 200)]);
    expect(skipLogic.actionSchema.safeParse({ type: "draw", strokes: [packedFill, packedShape] }).success).toBe(true);
  });
});

describe("closeRing", () => {
  test("closes a ring and moves any other visit to its first point", () => {
    expect(closeRing([[0, 0], [10, 0], [0, 0], [0, 10]])).toEqual([[0, 0], [10, 0], [1, 0], [0, 10], [0, 0]]);
  });

  test("drops rings with fewer than 3 corners", () => {
    expect(closeRing([[5, 5], [5.2, 5.1], [6, 6], [5, 5]])).toBeNull();
  });
});

describe("fighter parts", () => {
  test("packing keeps each stroke's part, and strokes without one stay untagged", () => {
    const line = [
      [0, 0],
      [100, 100],
    ];
    const packed = packStrokes([
      { c: 0, w: 1, points: line, t: "legs" },
      { c: 0, w: 1, points: line, k: "shape", t: "weapon" },
      { c: 0, w: 0, points: [[0, 0], [100, 0], [100, 100], [0, 0]], k: "fill", t: "body" },
      { c: 0, w: 1, points: line },
    ]);
    expect(packed.map((s) => s.t)).toEqual(["legs", "weapon", "body", undefined]);
    expect("t" in packed[3]!).toBe(false);
  });
});
