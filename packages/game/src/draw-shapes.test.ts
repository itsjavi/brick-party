import { CANVAS_UNITS, fillRings, strokeSchema } from "./games/skip-logic";
import { describe, expect, test } from "vitest";
import { drawShapes, strokesToSvg } from "./draw-shapes";

const still = () => 0.5;

describe("drawShapes", () => {
  test("turns shapes into valid strokes in the chosen color and size", () => {
    const strokes = drawShapes("color coral; size thick\ncircle 500 400 150\nline 100 900 900 900\ndot 10 10", still);
    expect(strokes).toHaveLength(3);
    expect(strokes.every((s) => strokeSchema.safeParse(s).success)).toBe(true);
    expect(strokes[0]).toMatchObject({ c: 2, w: 2 });
    const xs = strokes[0]!.p.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBe(350);
    expect(Math.max(...xs)).toBe(650);
  });

  test("keeps every point on the canvas", () => {
    const [stroke] = drawShapes("circle 0 0 300", Math.random);
    expect(stroke!.p.every((v) => v >= 0 && v <= CANVAS_UNITS)).toBe(true);
  });

  test("fills closed shapes solid, as one closed ring", () => {
    const strokes = drawShapes("color gray; fill circle 500 500 200; fill rect 0 0 100 50; fill triangle 10 10 90 10 50 80", still);
    expect(strokes.map((s) => s.k)).toEqual(["fill", "fill", "fill"]);
    expect(strokes[0]!.c).toBe(8);
    expect(strokes.every((s) => strokeSchema.safeParse(s).success)).toBe(true);
    for (const s of strokes) {
      const rings = fillRings(s.p);
      expect(rings).toHaveLength(1);
      expect(rings[0]!.at(-1)).toEqual(rings[0]![0]);
    }
    expect(fillRings(strokes[1]!.p)[0]).toEqual([[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]);
    expect(() => drawShapes("fill line 0 0 10 10")).toThrow(/Only closed shapes fill/);
  });

  test("outlines a triangle", () => {
    const [stroke] = drawShapes("triangle 100 900 500 100 900 900", still);
    expect(stroke!.k).toBeUndefined();
    expect(stroke!.p.slice(0, 2)).toEqual(stroke!.p.slice(-2));
  });

  test("thins out drawings over the game's point limit", () => {
    const busy = Array.from({ length: 60 }, (_, i) => `circle 500 500 ${100 + i * 6}`).join("\n");
    const strokes = drawShapes(busy, still);
    expect(strokes.reduce((n, s) => n + s.p.length, 0)).toBeLessThanOrEqual(12000);
  });

  test("explains a typo", () => {
    expect(() => drawShapes("cirle 1 2 3")).toThrow(/Unknown shape "cirle"/);
    expect(() => drawShapes("line 1 2 3")).toThrow(/Can't read "line 1 2 3"/);
    expect(() => drawShapes("color mauve")).toThrow(/Unknown color/);
  });
});

test("strokesToSvg draws each stroke as a polyline", () => {
  const svg = strokesToSvg(drawShapes("line 0 0 100 100; color teal; line 0 100 100 0", still));
  expect(svg.match(/<polyline/g)).toHaveLength(2);
  expect(svg).toContain("#00c4b8");
});

test("strokesToSvg draws fills under lines, and shapes as even outlines", () => {
  const strokes = [...drawShapes("line 0 0 100 100; color sky; fill rect 0 0 100 100", still), { c: 0, w: 2, p: [10, 10, 90, 10, 90, 90, 10, 10], k: "shape" as const }];
  const svg = strokesToSvg(strokes);
  expect(svg.indexOf('fill-rule="evenodd"')).toBeLessThan(svg.indexOf("<polyline"));
  expect(svg).toContain('<path d="M10,10L90,10L90,90Z" fill="none" stroke="#14213d" stroke-width="14"');
});

describe("fighter parts", () => {
  test("a part command tags the shapes after it, fills included", () => {
    const strokes = drawShapes("circle 500 500 50; part body; fill circle 500 500 100; part legs; line 500 600 500 900");
    expect(strokes.map((s) => [s.k, s.t])).toEqual([
      [undefined, undefined],
      ["fill", "body"],
      [undefined, "legs"],
    ]);
    expect(() => drawShapes("part tail; line 0 0 10 10")).toThrow(/Unknown part "tail"/);
  });

  test("a smaller limit thins the drawing down to fit", () => {
    const strokes = drawShapes(Array.from({ length: 20 }, (_, i) => `circle 500 500 ${100 + i * 10}`).join("; "), () => 0.5, { maxStrokes: 10, maxValues: 400 });
    expect(strokes).toHaveLength(10);
    expect(strokes.reduce((n, s) => n + s.p.length, 0)).toBeLessThanOrEqual(400);
  });
});
