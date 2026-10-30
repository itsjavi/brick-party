import { describe, expect, test } from "vitest";
import { PAD_TILES, geometryOf, tileAt, tileCenter } from "./geometry";

describe("Brick Brawl arena geometry", () => {
  const g = geometryOf(588, 7);

  test("the grid fills the canvas, less a margin around it", () => {
    expect(g.cell * (7 + 2 * PAD_TILES)).toBeCloseTo(588);
    expect(g.pad).toBeCloseTo(g.cell * PAD_TILES);
  });

  test("a point maps to the tile under it", () => {
    expect(tileAt(g, g.pad + 1, g.pad + 1)).toEqual({ x: 0, y: 0 });
    expect(tileAt(g, g.pad + 2.5 * g.cell, g.pad + 4.9 * g.cell)).toEqual({ x: 2, y: 4 });
    expect(tileAt(g, g.pad + 7 * g.cell - 1, g.pad + 7 * g.cell - 1)).toEqual({ x: 6, y: 6 });
  });

  test("the margin around the grid is no tile", () => {
    expect(tileAt(g, g.pad - 1, 100)).toBeNull();
    expect(tileAt(g, 100, g.pad - 1)).toBeNull();
    expect(tileAt(g, g.pad + 7 * g.cell + 1, 100)).toBeNull();
    expect(tileAt(g, 587, 587)).toBeNull();
  });

  test("every tile's center maps back to that tile", () => {
    for (const [x, y] of [
      [0, 0],
      [3, 5],
      [6, 6],
    ] as const) {
      const [px, py] = tileCenter(g, x, y);
      expect(tileAt(g, px, py)).toEqual({ x, y });
    }
  });

  test("bricks scale with the tiles, a little larger on small screens", () => {
    const big = geometryOf(700, 7);
    const phone = geometryOf(340, 11);
    expect(big.em * 10).toBeLessThan(big.cell);
    expect((phone.em * 10) / phone.cell).toBeGreaterThan((big.em * 10) / big.cell);
  });
});
