import {
  ACT,
  DOODLE_LIMITS,
  FLOOR_SCALE,
  SMASH_SCALE,
  drawShapes,
  fighterRig,
  fighterStats,
  newFight,
  type SmashBody,
  type SmashSpec,
} from "@brick/game";
import { describe, expect, test } from "vitest";
import { poseAt } from "../doodle/pose";
import {
  ASPECT,
  CAMERA_MIN_WIDTH,
  CAMERA_PAD,
  VIEW,
  easeCamera,
  frameCamera,
  gaitDistance,
  momentOf,
  rank,
  wideCamera,
} from "./scene";

const SPEC: SmashSpec = {
  w: 40,
  h: 60,
  weight: 1,
  run: 12,
  jump: 26,
  weapon: "blade",
  reach: 50,
  damage: 10,
  cooldown: 8,
  shot: 10,
};

/** A body on the Sketchbook's main stage (220 units up), or as `over` says. */
function body(over: Partial<SmashBody> = {}): SmashBody {
  const b = newFight("sketchbook", 1, 1).bodies[0]!;
  return Object.assign(b, { x: 800, y: 220, gr: 0, vx: 0, vy: 0, atk: 0, stun: 0, out: 0 }, over);
}

const BIPED = (() => {
  const strokes = drawShapes(
    "part body; fill circle 500 500 150; part legs; line 440 640 420 880; line 560 640 580 880; part arms; line 650 500 850 450",
    () => 0.5,
    DOODLE_LIMITS,
  );
  const rig = fighterRig(strokes);
  return { rig, stats: fighterStats(strokes, rig) };
})();

describe("momentOf", () => {
  test("a fighter running on a platform high above the bottom is on the ground, so its legs walk", () => {
    const m = momentOf(body({ vx: 12 }), 0, 0, Infinity);
    expect(m.act).toBe(ACT.move);
    expect(m.y).toBe(0);
    // Its legs swing with the distance walked, instead of holding the jump pose.
    const legs = (dist: number) =>
      poseAt(BIPED, momentOf(body({ vx: 12 }), dist, 0, Infinity)).limbs.slice(0, 2);
    expect(legs(0)).not.toEqual(legs(20));
  });

  test("a fighter standing still on a ledge is idle and grounded", () => {
    const m = momentOf(body({ y: 580, gr: 3 }), 0, 0, Infinity);
    expect(m.act).toBe(ACT.idle);
    expect(m.y).toBe(0);
  });

  test("a jumping fighter is airborne", () => {
    const m = momentOf(body({ y: 400, gr: -1, vy: 20 }), 0, 0, Infinity);
    expect(m.act).toBe(ACT.air);
    expect(m.y).toBeGreaterThan(0.5);
  });

  test("an attack or a hit takes over from running", () => {
    expect(momentOf(body({ vx: 12, atk: 3 }), 0, 0, Infinity).act).toBe(ACT.attack);
    expect(momentOf(body({ vx: 12, stun: 5 }), 0, 0, 0).act).toBe(ACT.hurt);
  });

  test("the gait covers the ground the drawing's feet would", () => {
    expect(gaitDistance(SMASH_SCALE)).toBeCloseTo(FLOOR_SCALE);
    expect(gaitDistance(-10)).toBe(gaitDistance(10));
  });
});

describe("the camera", () => {
  test("frames two fighters close together as close as it goes, with room around them, centered on them", () => {
    const cam = frameCamera(wideCamera(), [body({ x: 700 }), body({ x: 760 })], [SPEC, SPEC], false);
    expect(cam.w).toBeCloseTo(Math.max(CAMERA_MIN_WIDTH, (SPEC.h + 2 * CAMERA_PAD) * ASPECT));
    expect(cam.x + cam.w / 2).toBeCloseTo(730);
    expect(cam.y).toBeGreaterThanOrEqual(0);
    expect(cam.y + cam.w / ASPECT).toBeLessThanOrEqual(VIEW.height);
  });

  test("widens for fighters far apart, and never past the whole view", () => {
    const apart = frameCamera(wideCamera(), [body({ x: 100 }), body({ x: 1500 })], [SPEC, SPEC], false);
    expect(apart.w).toBe(VIEW.width);
    expect(apart.x).toBe(VIEW.x);
    const some = frameCamera(wideCamera(), [body({ x: 500 }), body({ x: 900 })], [SPEC, SPEC], false);
    expect(some.w).toBeGreaterThan(CAMERA_MIN_WIDTH);
    expect(some.w).toBeLessThan(VIEW.width);
  });

  test("shows the whole stage when the fight is over or nobody's in play", () => {
    expect(frameCamera(wideCamera(), [body(), body({ x: 900 })], [SPEC, SPEC], true)).toEqual(wideCamera());
    expect(frameCamera(wideCamera(), [body({ out: 20 })], [SPEC], false)).toEqual(wideCamera());
  });

  test("eases toward where it wants to be", () => {
    const view = wideCamera();
    const target = { x: 400, y: 100, w: CAMERA_MIN_WIDTH };
    easeCamera(view, target, 0.5);
    expect(view.x).toBeCloseTo((VIEW.x + 400) / 2);
    expect(view.w).toBeCloseTo((VIEW.width + CAMERA_MIN_WIDTH) / 2);
    for (let i = 0; i < 60; i++) easeCamera(view, target, 0.5);
    expect(view.x).toBeCloseTo(400);
  });
});

test("the scoreboard puts the most lives first, then knockouts, then the least damage", () => {
  const bodies = [
    body({ lives: 2, dmg: 10 }),
    body({ lives: 3, dmg: 90 }),
    body({ lives: 2, dmg: 5 }),
    body({ lives: 2, dmg: 50 }),
  ];
  expect(rank(bodies, [0, 0, 0, 1])).toEqual([1, 3, 2, 0]);
});
