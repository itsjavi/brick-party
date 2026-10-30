import { DOODLE_LIMITS, drawShapes, fighterRig, fighterStats } from "@brick/game";
import { describe, expect, test } from "vitest";
import {
  affine,
  apply,
  bodyTransform,
  limbTransform,
  multiply,
  rotate,
  rotateAround,
  scale,
  set,
  skewX,
  translate,
  type Affine,
  type Placement,
} from "./affine";
import { partIndexes } from "./canvasFighter";
import type { Pose } from "./pose";

const BIPED = (() => {
  const strokes = drawShapes(
    "part body; fill circle 500 500 150; part legs; line 440 640 420 880; line 560 640 580 880; part arms; line 650 500 850 450; part weapon; line 850 450 950 300",
    () => 0.5,
    DOODLE_LIMITS,
  );
  const rig = fighterRig(strokes);
  return { strokes, rig, stats: fighterStats(strokes, rig) };
})();

const still: Pose = {
  limbs: [],
  weapon: 0,
  body: 0,
  aroundFeet: false,
  bob: 0,
  jitter: 0,
  squash: 1,
  skew: 0,
  lift: 0,
  flash: 0,
  opacity: 1,
};
const at: Placement = { x: 300, y: 20, face: 1, floor: 400, scale: 0.5 };

const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

/** An SVG transform function as a matrix of its own, to build the chain the SVG fighter uses independently. */
const m = (a: number, b: number, c: number, d: number, e: number, f: number) =>
  set(affine(), a, b, c, d, e, f);
const T = (x: number, y: number) => m(1, 0, 0, 1, x, y);
const S = (x: number, y: number) => m(x, 0, 0, y, 0, 0);
const R = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return m(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
};
const chain = (...ms: Affine[]) => ms.reduce((acc, n) => multiply(acc, acc, n), affine());

describe("affine transforms", () => {
  test("compose like SVG transform lists, left to right", () => {
    const ours = rotateAround(scale(translate(affine(), 10, 20), 2, 3), 30, 5, 6);
    const svg = chain(T(10, 20), S(2, 3), T(5, 6), R(30), T(-5, -6));
    for (const p of [
      [0, 0],
      [7, -3],
      [100, 50],
    ] as const)
      close(apply(ours, p[0], p[1]), apply(svg, p[0], p[1]));
  });

  test("rotate turns clockwise on screen, and skewX shears x by y", () => {
    close(apply(rotate(affine(), 90), 1, 0), [0, 1]);
    close(apply(skewX(affine(), 45), 0, 10), [10, 10]);
  });
});

describe("a fighter's transforms", () => {
  const { rig } = BIPED;
  const [cx, cy] = rig.center;
  const flip = rig.facesRight ? 1 : -1;

  test("standing still, its feet's middle lands on the floor at its spot", () => {
    const body = bodyTransform(affine(), rig, still, at);
    close(apply(body, cx, rig.feet), [at.x, at.floor - at.y]);
    close(apply(body, cx + 100, rig.feet), [at.x + 100 * at.scale * flip, at.floor - at.y]);
    close(apply(body, cx, rig.feet - 100), [at.x, at.floor - at.y - 100 * at.scale]);
  });

  test("facing the other way mirrors it around its spot", () => {
    const right = bodyTransform(affine(), rig, still, at);
    const left = bodyTransform(affine(), rig, still, { ...at, face: -1 });
    const [rx, ry] = apply(right, cx + 80, cy);
    const [lx, ly] = apply(left, cx + 80, cy);
    expect(lx - at.x).toBeCloseTo(-(rx - at.x));
    expect(ly).toBeCloseTo(ry);
  });

  test("matches the SVG fighter's chain for a busy pose", () => {
    const pose: Pose = { ...still, body: 25, bob: -7, jitter: 3, squash: 0.86, skew: 6, lift: 12 };
    const ours = bodyTransform(affine(), rig, pose, at);
    const svg = chain(
      T(at.x, at.floor - at.y - pose.lift),
      S(at.face * flip * at.scale, at.scale),
      T(-cx, -rig.feet),
      T(pose.jitter, pose.bob),
      T(cx, cy),
      R(pose.body),
      T(-cx, -cy),
      T(cx, rig.feet),
      S(1 / pose.squash, pose.squash),
      m(1, 0, Math.tan((pose.skew * Math.PI) / 180), 1, 0, 0),
      T(-cx, -rig.feet),
    );
    for (const p of [
      [cx, cy],
      [0, 0],
      [900, 300],
      [cx, rig.feet],
    ] as const)
      close(apply(ours, p[0], p[1]), apply(svg, p[0], p[1]));
  });

  test("turns around its center, or around its feet when it falls over", () => {
    const base = bodyTransform(affine(), rig, still, at);
    close(apply(bodyTransform(affine(), rig, { ...still, body: 70 }, at), cx, cy), apply(base, cx, cy));
    close(
      apply(bodyTransform(affine(), rig, { ...still, body: -85, aroundFeet: true }, at), cx, rig.feet),
      apply(base, cx, rig.feet),
    );
  });

  test("a limb turns around where it joins the body", () => {
    const body = bodyTransform(affine(), rig, still, at);
    const limb = rig.limbs[0]!;
    const turned = limbTransform(affine(), body, limb.pivot, 40);
    close(apply(turned, limb.pivot[0], limb.pivot[1]), apply(body, limb.pivot[0], limb.pivot[1]));
    const tip = apply(turned, limb.pivot[0], limb.pivot[1] + 100);
    const straight = apply(body, limb.pivot[0], limb.pivot[1] + 100);
    expect(tip).not.toEqual(straight);
  });

  test("its strokes split into body, limbs and weapon, every stroke once, fills first", () => {
    const parts = partIndexes(BIPED.strokes, rig);
    const all = [...parts.body, ...parts.limbs.flat(), ...(parts.weapon ?? [])].sort((a, b) => a - b);
    expect(all).toEqual(BIPED.strokes.map((_, i) => i));
    expect(parts.limbs).toHaveLength(rig.limbs.length);
    expect(parts.weapon).not.toBeNull();
    const kinds = parts.body.map((i) => BIPED.strokes[i]!.k);
    const firstLine = kinds.findIndex((k) => k !== "fill");
    if (firstLine >= 0) expect(kinds.slice(firstLine).includes("fill")).toBe(false);
  });
});
