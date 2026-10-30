import {
  ACT,
  DOODLE_LIMITS,
  FRAME_STRIDE,
  drawShapes,
  fighterRig,
  fighterStats,
  resolveFight,
} from "@brick/game";
import { describe, expect, test } from "vitest";
import { FightTrack, poseAt, type Moment } from "./pose";

const fighter = (shapes: string) => {
  const strokes = drawShapes(shapes, () => 0.5, DOODLE_LIMITS);
  const rig = fighterRig(strokes);
  return { strokes, rig, stats: fighterStats(strokes, rig) };
};
const BIPED = fighter(
  "part body; fill circle 500 500 150; part legs; line 440 640 420 880; line 560 640 580 880; part arms; line 650 500 850 450",
);
const BALL = fighter("part body; fill circle 500 700 200");
const at = (over: Partial<Moment>): Moment => ({
  x: 500,
  y: 0,
  act: ACT.idle,
  face: 1,
  dist: 0,
  t: 0,
  sinceAttack: Infinity,
  sinceHurt: Infinity,
  sinceKo: -Infinity,
  ...over,
});

describe("fighter poses", () => {
  test("walking legs swing from the hip in turn, standing legs barely move", () => {
    const walking = poseAt(BIPED, at({ act: ACT.move, dist: 20 }));
    const [left, right] = walking.limbs;
    expect(Math.abs(left!)).toBeGreaterThan(5);
    expect(Math.sign(left!)).toBe(-Math.sign(right!));
    const standing = poseAt(BIPED, at({ act: ACT.idle, dist: 20 }));
    expect(Math.abs(standing.limbs[0]!)).toBeLessThanOrEqual(3);
  });

  test("an arm winds up, then smashes forward, after a swing", () => {
    const windup = poseAt(BIPED, at({ sinceAttack: 0 })).limbs[2]!;
    const smash = poseAt(BIPED, at({ sinceAttack: 1 })).limbs[2]!;
    expect(windup).toBeLessThan(0);
    expect(smash).toBeGreaterThan(30);
  });

  test("a round fighter without legs rolls as it travels", () => {
    expect(BALL.stats.style).toBe("roll");
    const a = poseAt(BALL, at({ act: ACT.move, dist: 0 })).body;
    const b = poseAt(BALL, at({ act: ACT.move, dist: 100 })).body;
    expect(Math.abs(b - a)).toBeGreaterThan(45);
  });

  test("a knockout spins the fighter up, then lays it flat", () => {
    const flying = poseAt(BIPED, at({ act: ACT.ko, sinceKo: 3 }));
    expect(flying.lift).toBeGreaterThan(0);
    const flat = poseAt(BIPED, at({ act: ACT.ko, sinceKo: 20 }));
    expect(flat.lift).toBeCloseTo(0);
    expect(Math.abs(flat.body)).toBe(90);
    expect(flat.aroundFeet).toBe(true);
  });
});

describe("fight tracks", () => {
  const fight = resolveFight(
    [
      { id: "a", stats: BIPED.stats },
      { id: "b", stats: BALL.stats },
    ],
    4,
    150,
  );
  const track = new FightTrack(fight.frames, fight.events, 2);

  test("positions are interpolated between ticks and hold on the last frame", () => {
    const x0 = fight.frames[0]![0]!;
    const x1 = fight.frames[1]![0]!;
    expect(track.moment(0, 0.5).x).toBeCloseTo((x0 + x1) / 2);
    expect(track.moment(0, track.end + 50).x).toBe(fight.frames.at(-1)![0]);
  });

  test("knows how long since each fighter last swung and was hit", () => {
    const hit = fight.events.find((e) => e.k === "hit" || e.k === "crit")!;
    expect(track.moment(hit.b!, hit.t + 1).sinceHurt).toBe(1);
    const swing = fight.frames.findIndex((f) => f[3] === ACT.attack || f[FRAME_STRIDE + 3] === ACT.attack);
    const who = fight.frames[swing]![3] === ACT.attack ? 0 : 1;
    expect(track.moment(who, swing + 0.5).sinceAttack).toBe(0.5);
  });
});
