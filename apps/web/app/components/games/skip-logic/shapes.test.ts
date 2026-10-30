import { describe, expect, test } from "vitest";
import { bigEnough, shapePoints } from "./shapes";

describe("shapePoints", () => {
  test("a rectangle is its four corners, closed", () => {
    expect(shapePoints("rect", [100, 100], [300, 200])).toEqual([[100, 100], [300, 100], [300, 200], [100, 200], [100, 100]]);
  });

  test("Shift makes it square, toward the drag", () => {
    expect(shapePoints("rect", [500, 500], [400, 700], true)[2]).toEqual([300, 700]);
  });

  test("a triangle points toward where the drag started", () => {
    expect(shapePoints("triangle", [100, 100], [300, 400])[0]).toEqual([200, 100]);
    expect(shapePoints("triangle", [100, 400], [300, 100])[0]).toEqual([200, 400]);
  });

  test("an ellipse fits the drag and closes", () => {
    const points = shapePoints("ellipse", [100, 100], [500, 300]);
    expect(points.at(-1)).toEqual(points[0]);
    const xs = points.map((p) => p[0]!);
    const ys = points.map((p) => p[1]!);
    expect(Math.min(...xs)).toBeCloseTo(100, 0);
    expect(Math.max(...xs)).toBeCloseTo(500, 0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(300);
  });
});

test("a click without a drag isn't a shape", () => {
  expect(bigEnough(shapePoints("ellipse", [100, 100], [102, 103]))).toBe(false);
  expect(bigEnough(shapePoints("rect", [100, 100], [300, 100]))).toBe(true);
});
