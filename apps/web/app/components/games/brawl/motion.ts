/**
 * Easing and tweening for the Brick Brawl canvas: the same curves the arena used as CSS transitions and keyframes,
 * as plain functions of time so the renderer can sample them every frame.
 */

export type Ease = (t: number) => number;

/** CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress from 0 to 1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // x(s) only grows while x1 and x2 stay within 0..1, so halving the interval finds s for this t.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

export const LINEAR: Ease = (t) => Math.min(1, Math.max(0, t));
export const EASE = cubicBezier(0.25, 0.1, 0.25, 1);
export const EASE_IN = cubicBezier(0.42, 0, 1, 1);
export const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
/** How bricks slide between tiles: quick, with a little overshoot. */
export const SLIDE = cubicBezier(0.3, 1.5, 0.5, 1);
/** The shield bubble popping up. */
export const POP = cubicBezier(0.2, 1.8, 0.4, 1);
/** A dropped brick falling from above, speeding up. */
export const FALL = cubicBezier(0.5, 0, 0.9, 0.4);

/** A value moving from `from` to `to` over `dur` ms from `start`. Values are arrays so one tween can carry x and y. */
export interface Tween {
  from: number[];
  to: number[];
  start: number;
  dur: number;
  ease: Ease;
}

export function still(value: number[]): Tween {
  return { from: value, to: value, start: 0, dur: 0, ease: LINEAR };
}

export function tweenAt(tw: Tween, now: number): number[] {
  if (tw.dur <= 0 || now >= tw.start + tw.dur) return tw.to;
  const k = tw.ease(Math.max(0, (now - tw.start) / tw.dur));
  return tw.from.map((f, i) => f + (tw.to[i]! - f) * k);
}

export function settled(tw: Tween, now: number): boolean {
  return tw.dur <= 0 || now >= tw.start + tw.dur;
}

/** Heads somewhere new from wherever the tween is now, the way a CSS transition restarts from its current value. */
export function retarget(tw: Tween, to: number[], now: number, dur: number, ease: Ease): Tween {
  if (tw.to.every((v, i) => v === to[i])) return tw;
  return { from: tweenAt(tw, now), to, start: now, dur, ease };
}

/**
 * Samples a CSS-style keyframe animation at progress `t` (0 to 1). Each frame is `[offset, values]`; the ease applies
 * to each segment between two frames, like `animation-timing-function` does.
 */
export function keyframes(t: number, frames: [number, number[]][], ease: Ease = EASE): number[] {
  const p = Math.min(1, Math.max(0, t));
  for (let i = 1; i < frames.length; i++) {
    const [o1, v1] = frames[i]!;
    const [o0, v0] = frames[i - 1]!;
    if (p <= o1) {
      const k = o1 === o0 ? 1 : ease((p - o0) / (o1 - o0));
      return v0.map((v, j) => v + (v1[j]! - v) * k);
    }
  }
  return frames[frames.length - 1]![1];
}
