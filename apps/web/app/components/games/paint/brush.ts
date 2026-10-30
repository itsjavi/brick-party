import { PAINT_INK, PAINT_MAX_CELLS, PAINT_MAX_STROKES, paintStepToward } from "@brick/game";

/** Pointer samples the brush may lag behind by, so a dry brush doesn't trail forever. */
export const MAX_TRAIL = 120;

/** The brush on this screen: where it is, where the pointer has been, its ink and what's waiting to be sent. */
export interface Brush {
  down: boolean;
  /** Pointer cells still to walk to, oldest first. */
  trail: number[];
  /** The cell the brush is on, or `null` while lifted. */
  pen: number | null;
  /** Where the pointer hovers, for the brush ring. */
  hover: number | null;
  ink: number;
  inkAt: number;
  /** Strokes painted since the last batch went out. */
  pending: number[][];
  /** The stroke cells are being added to, or `null` when the next cell starts a new one in `pending`. */
  stroke: number[] | null;
  /** Cells in `pending`. */
  count: number;
}

export const newBrush = (now: number): Brush => ({
  down: false,
  trail: [],
  pen: null,
  hover: null,
  ink: PAINT_INK.max,
  inkAt: now,
  pending: [],
  stroke: null,
  count: 0,
});

/** Puts the brush down on `cell`; it paints from the next `moveBrush`. */
export function pressBrush(b: Brush, cell: number) {
  b.down = true;
  b.trail = [cell];
  b.hover = cell;
}

/** Adds a pointer sample to walk to. */
export function dragBrush(b: Brush, cell: number) {
  b.hover = cell;
  if (b.down && b.trail.at(-1) !== cell && b.trail.length < MAX_TRAIL) b.trail.push(cell);
}

export function liftBrush(b: Brush) {
  b.down = false;
  b.trail = [];
  b.pen = null;
  b.stroke = null;
}

/**
 * Walks the brush along the pointer's trail one cell at a time, as far as its ink goes, and returns every cell it
 * painted (also queued in `pending`). Putting the brush down somewhere new costs extra ink, as it does on the server,
 * and a batch never grows past what the server takes.
 */
export function moveBrush(b: Brush, now: number, canPaint: boolean): number[] {
  b.ink = Math.min(PAINT_INK.max, b.ink + ((now - b.inkAt) * PAINT_INK.perSecond) / 1000);
  b.inkAt = now;
  if (!canPaint) {
    liftBrush(b);
    return [];
  }
  const painted: number[] = [];
  if (!b.down) return painted;
  const paint = (cell: number) => {
    if (!b.stroke) {
      b.stroke = [];
      b.pending.push(b.stroke);
    }
    b.stroke.push(cell);
    b.count += 1;
    b.pen = cell;
    painted.push(cell);
  };
  if (b.pen === null) {
    const start = b.trail[0];
    const cost = 1 + PAINT_INK.strokeCost;
    if (
      start === undefined ||
      b.ink < cost ||
      b.count >= PAINT_MAX_CELLS ||
      b.pending.length >= PAINT_MAX_STROKES
    )
      return painted;
    b.ink -= cost;
    b.stroke = null;
    paint(start);
  }
  while (b.trail.length && b.ink >= 1 && b.count < PAINT_MAX_CELLS) {
    if (b.trail[0] === b.pen) {
      b.trail.shift();
      continue;
    }
    b.ink -= 1;
    paint(paintStepToward(b.pen!, b.trail[0]!));
  }
  return painted;
}

/** The strokes waiting to be sent, if any; the brush carries on from where it is in the next batch. */
export function takeBatch(b: Brush): number[][] | null {
  if (!b.pending.length) return null;
  const strokes = b.pending;
  b.pending = [];
  b.stroke = null;
  b.count = 0;
  return strokes;
}
