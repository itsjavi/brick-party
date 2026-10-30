import { describe, expect, test } from "vitest";
import { LINEAR, SLIDE, cubicBezier, keyframes, retarget, settled, still, tweenAt } from "./motion";

describe("Brick Brawl motion", () => {
  test("cubic-bezier curves start at 0, end at 1, and a straight one is linear", () => {
    const straight = cubicBezier(0, 0, 1, 1);
    expect([straight(0), straight(1)]).toEqual([0, 1]);
    for (const t of [0.1, 0.25, 0.5, 0.9]) expect(straight(t)).toBeCloseTo(t, 4);
    expect(cubicBezier(0.42, 0, 1, 1)(0.5)).toBeLessThan(0.5);
  });

  test("bricks slide past their tile a little before settling, like the old CSS transition", () => {
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => SLIDE(i / 50)));
    expect(peak).toBeGreaterThan(1.05);
    expect(SLIDE(1)).toBe(1);
  });

  test("a tween moves from start to end over its duration, then holds", () => {
    const tw = { from: [0, 0], to: [2, 4], start: 1000, dur: 500, ease: LINEAR };
    expect(tweenAt(tw, 900)).toEqual([0, 0]);
    expect(tweenAt(tw, 1250)).toEqual([1, 2]);
    expect(tweenAt(tw, 2000)).toEqual([2, 4]);
    expect([settled(tw, 1499), settled(tw, 1500)]).toEqual([false, true]);
  });

  test("retargeting mid-slide starts from where the brick is now, and the same target changes nothing", () => {
    const tw = { from: [0, 0], to: [2, 0], start: 0, dur: 100, ease: LINEAR };
    const next = retarget(tw, [2, 2], 50, 100, LINEAR);
    expect(next.from).toEqual([1, 0]);
    expect(next.to).toEqual([2, 2]);
    expect(next.start).toBe(50);
    expect(retarget(tw, [2, 0], 50, 100, LINEAR)).toBe(tw);
    expect(tweenAt(still([3, 1]), 0)).toEqual([3, 1]);
  });

  test("keyframes hit each frame's value at its offset and blend between them", () => {
    const bump: [number, number[]][] = [
      [0, [0]],
      [0.3, [6]],
      [0.6, [-6]],
      [1, [0]],
    ];
    expect(keyframes(0, bump, LINEAR)).toEqual([0]);
    expect(keyframes(0.3, bump, LINEAR)).toEqual([6]);
    expect(keyframes(0.45, bump, LINEAR)[0]).toBeCloseTo(0);
    expect(keyframes(0.6, bump, LINEAR)).toEqual([-6]);
    expect(keyframes(1.5, bump, LINEAR)).toEqual([0]);
  });
});
