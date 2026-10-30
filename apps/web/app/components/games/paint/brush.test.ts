import { PAINT_INK, PAINT_MAX_CELLS, PAINT_W, paintGrabActionSchema, paintTouches } from "@brick/game";
import { describe, expect, test } from "vitest";
import { dragBrush, liftBrush, moveBrush, newBrush, pressBrush, takeBatch } from "./brush";

const c = (x: number, y: number) => y * PAINT_W + x;

describe("the brush", () => {
  test("walks to each pointer sample one side at a time, and batches carry on from each other", () => {
    const b = newBrush(0);
    pressBrush(b, c(2, 2));
    dragBrush(b, c(6, 5));
    const painted = moveBrush(b, 0, true);
    expect(painted[0]).toBe(c(2, 2));
    expect(painted.at(-1)).toBe(c(6, 5));
    painted.slice(1).forEach((cell, i) => expect(paintTouches(painted[i]!, cell)).toBe(true));
    expect(painted).toHaveLength(8);
    const first = takeBatch(b)!;
    expect(first).toEqual([painted]);
    expect(paintGrabActionSchema.safeParse({ type: "paint", strokes: first }).success).toBe(true);

    dragBrush(b, c(6, 8));
    const more = moveBrush(b, 100, true);
    expect(paintTouches(c(6, 5), more[0]!)).toBe(true);
    expect(takeBatch(b)).toEqual([more]);
    expect(takeBatch(b)).toBeNull();
  });

  test("runs dry: the brush lags behind the pointer until the ink refills", () => {
    const b = newBrush(0);
    pressBrush(b, c(0, 0));
    dragBrush(b, c(47, 0));
    dragBrush(b, c(47, 31));
    const painted = moveBrush(b, 0, true);
    expect(painted).toHaveLength(PAINT_INK.max - PAINT_INK.strokeCost);
    expect(b.pen).toBe(c(painted.length - 1, 0));
    expect(moveBrush(b, 0, true)).toEqual([]);
    // A tenth of a second later, a few more cells.
    expect(moveBrush(b, 100, true)).toHaveLength(Math.floor(PAINT_INK.perSecond / 10));
    expect(b.count).toBeLessThanOrEqual(PAINT_MAX_CELLS);
  });

  test("lifting and pressing elsewhere starts a new stroke in the same batch", () => {
    const b = newBrush(0);
    pressBrush(b, c(1, 1));
    dragBrush(b, c(3, 1));
    moveBrush(b, 0, true);
    liftBrush(b);
    pressBrush(b, c(20, 20));
    moveBrush(b, 0, true);
    expect(takeBatch(b)).toEqual([[c(1, 1), c(2, 1), c(3, 1)], [c(20, 20)]]);
  });

  test("paints nothing when it can't, and lets go", () => {
    const b = newBrush(0);
    pressBrush(b, c(1, 1));
    expect(moveBrush(b, 0, false)).toEqual([]);
    expect(b.down).toBe(false);
    expect(takeBatch(b)).toBeNull();
  });
});
