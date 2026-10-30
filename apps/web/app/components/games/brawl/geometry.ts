/** Where the Brick Brawl grid sits on its canvas, and which tile a pointer is over. All sizes are CSS pixels. */

/** Room around the grid, in tiles, so hats, name tags and bricks teetering on the edge stay on the canvas. */
export const PAD_TILES = 0.45;
/** Space between tiles. */
export const TILE_GAP = 3;

export interface Geometry {
  /** The canvas's width and height: the arena is square. */
  width: number;
  /** Tiles per side. */
  n: number;
  /** One tile's pitch, gap included. */
  cell: number;
  /** Where the grid starts, from the canvas's top-left corner. */
  pad: number;
  /** The unit a brick avatar is drawn in, like the `em` of the HTML `Brick`: a brick is 10 of these wide. */
  em: number;
}

export function geometryOf(width: number, n: number): Geometry {
  const cell = width / (n + 2 * PAD_TILES);
  // Bricks take a bit over half a tile, and a bit more on small screens so faces stay readable.
  const em = Math.max(0.058 * cell, Math.min(0.075 * cell, 3));
  return { width, n, cell, pad: cell * PAD_TILES, em };
}

/** The tile under a point on the canvas, or `null` off the grid. */
export function tileAt(g: Geometry, px: number, py: number): { x: number; y: number } | null {
  const x = Math.floor((px - g.pad) / g.cell);
  const y = Math.floor((py - g.pad) / g.cell);
  if (x < 0 || y < 0 || x >= g.n || y >= g.n) return null;
  return { x, y };
}

/** The canvas point at the middle of a tile. Fractional tiles are fine, for bricks sliding between tiles. */
export function tileCenter(g: Geometry, x: number, y: number): [number, number] {
  return [g.pad + (x + 0.5) * g.cell, g.pad + (y + 0.5) * g.cell];
}
