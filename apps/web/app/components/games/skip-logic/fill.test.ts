import { CANVAS_UNITS, fillRings } from "@brick/game";
import { describe, expect, test } from "vitest";
import { floodCells, grow, traceRings } from "./fill";

/** An RGBA raster of `size`² cells, white with no lines, plus a setter. */
function raster(size: number, fill = 255) {
  const data = new Uint8ClampedArray(size * size * 4).fill(fill);
  const set = (x: number, y: number, rgba: number[]) => data.set(rgba, (y * size + x) * 4);
  return { data, set };
}

const count = (mask: Uint8Array) => mask.reduce((n, v) => n + v, 0);

/** The area the rings cover under the even-odd rule, in canvas units². */
function area(rings: [number, number][][]): number {
  return Math.abs(
    rings.reduce((sum, ring) => {
      let a = 0;
      for (let i = 0; i + 1 < ring.length; i++) a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
      return sum + a / 2;
    }, 0),
  );
}

describe("floodCells", () => {
  test("stops at lines of any color and at other colors", () => {
    const size = 10;
    const colors = raster(size);
    const lines = raster(size, 0);
    for (let y = 0; y < size; y++) lines.set(5, y, [255, 230, 0, 255]);
    for (let x = 0; x < 5; x++) colors.set(x, 9, [255, 107, 87, 255]);
    const mask = floodCells(colors.data, lines.data, size, 1, 1)!;
    expect(count(mask)).toBe(5 * 9);
    expect(mask[9 * size + 1]).toBe(0);
  });

  test("ignores a tap on a line", () => {
    const lines = raster(4, 0);
    lines.set(2, 2, [0, 0, 0, 200]);
    expect(floodCells(raster(4).data, lines.data, 4, 2, 2)).toBeNull();
  });

  test("leaks through nothing diagonal: cells only join edge to edge", () => {
    const size = 4;
    const lines = raster(size, 0);
    for (let i = 0; i < size; i++) lines.set(i, size - 1 - i, [0, 0, 0, 255]);
    expect(count(floodCells(raster(size).data, lines.data, size, 0, 0)!)).toBe(6);
  });
});

describe("traceRings", () => {
  test("outlines an area with a hole as an outer ring and a hole ring", () => {
    const size = 20;
    const mask = new Uint8Array(size * size);
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) if (x < 8 || x >= 12 || y < 8 || y >= 12) mask[y * size + x] = 1;
    const rings = traceRings(mask, size);
    expect(rings).toHaveLength(2);
    const cell = CANVAS_UNITS / size;
    // Smoothing may shave up to a quarter cell on average off the 80 cells of outline.
    expect(Math.abs(area(rings) - (16 * 16 - 4 * 4) * cell * cell)).toBeLessThan(80 * 0.25 * cell * cell);
    for (const ring of rings) expect(ring.at(-1)).toEqual(ring[0]);
    expect(fillRings(rings.flat(2))).toEqual(rings);
  });

  test("smooths stair steps into slopes", () => {
    const size = 40;
    const mask = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x <= y; x++) mask[y * size + x] = 1;
    const [ring] = traceRings(mask, size);
    expect(ring!.length).toBeLessThanOrEqual(6);
  });

  test("keeps outlines cheap: a disc and a steep triangle take a few dozen points", () => {
    const size = 200;
    const disc = new Uint8Array(size * size);
    const steep = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x - 100) ** 2 + (y - 100) ** 2 <= 40 ** 2) disc[y * size + x] = 1;
        // A triangle with sides at roughly 2.6 to 1, like one dragged out with the triangle tool.
        if (y >= 20 && y < 180 && Math.abs(x - 100) <= (y - 20) / 2.6) steep[y * size + x] = 1;
      }
    }
    expect(traceRings(disc, size)[0]!.length).toBeLessThan(40);
    expect(traceRings(steep, size)[0]!.length).toBeLessThan(20);
  });

  test("straightens edges that are nearly upright, where the stair steps are long", () => {
    const size = 200;
    const quad = new Uint8Array(size * size);
    // Sides that drift one cell every 7, like a hand-drawn box.
    for (let y = 20; y < 180; y++) for (let x = 20 + Math.floor((y - 20) / 7); x < 180 + Math.floor((y - 20) / 7) && x < size; x++) quad[y * size + x] = 1;
    expect(traceRings(quad, size)[0]!.length).toBeLessThan(16);
  });

  test("keeps every point on the canvas", () => {
    const size = 10;
    const mask = grow(new Uint8Array(size * size).fill(1), size);
    const rings = traceRings(mask, size);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.every(([x, y]) => x >= 0 && y >= 0 && x <= CANVAS_UNITS && y <= CANVAS_UNITS)).toBe(true);
  });
});

test("grow adds one cell all round", () => {
  const size = 5;
  const mask = new Uint8Array(size * size);
  mask[2 * size + 2] = 1;
  expect(count(grow(mask, size))).toBe(9);
});
