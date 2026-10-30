import {
  GO_TICK,
  KEY,
  SMASH_TICK_MS,
  newFight,
  packBody,
  type SmashFight,
  type SmashFightView,
  type SmashSpec,
} from "@brick/game";
import { describe, expect, test } from "vitest";
import { INTERP_TICKS, FightClient } from "./netcode";

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
const cast = [SPEC, SPEC];

/** A fight past the countdown with fighter 0 standing at `x0` and fighter 1 at `x1` on the Sketchbook's stage. */
function fight(tick: number, x0: number, x1: number): SmashFight {
  const f = newFight("sketchbook", 2, 1);
  f.tick = tick;
  Object.assign(f.bodies[0]!, { x: x0, y: 220, gr: 0 });
  Object.assign(f.bodies[1]!, { x: x1, y: 220, gr: 0 });
  return f;
}

function viewOf(f: SmashFight, me = 0): SmashFightView {
  return {
    tick: f.tick,
    stage: f.stage,
    seed: f.seed,
    over: -1,
    bodies: f.bodies.map(packBody),
    mine: me >= 0 ? f.bodies[me]! : null,
    shots: [],
    items: [],
    events: [],
    outOrder: [],
    tally: null,
  };
}

const T = GO_TICK + 100;

describe("FightClient", () => {
  test("draws everyone else a little in the past, gliding between updates", () => {
    const c = new FightClient(-1, cast, "sketchbook");
    c.receive(viewOf(fight(T, 400, 600), -1), 0);
    c.receive(viewOf(fight(T + 2, 400, 700), -1), 100);
    const at = c.frame(100 + SMASH_TICK_MS)!;
    expect(at.tick).toBeCloseTo(T + 3 - INTERP_TICKS, 5);
    expect(at.bodies[1]!.x).toBeCloseTo(650, 5);
  });

  test("moves your own fighter at once from your keys, before the server has heard of them", () => {
    const c = new FightClient(0, cast, "sketchbook");
    c.receive(viewOf(fight(T, 600, 1000)), 0);
    c.input(KEY.right, false);
    c.advance(4 * SMASH_TICK_MS);
    expect(c.local!.x).toBeGreaterThan(600 + SPEC.run * 2);
    expect(c.frame(4 * SMASH_TICK_MS)!.bodies[0]!.x).toBeCloseTo(c.local!.x, 5);
  });

  test("closes a small gap to the server gently, and a big one at once", () => {
    const c = new FightClient(0, cast, "sketchbook");
    c.receive(viewOf(fight(T, 600, 1000)), 0);
    c.advance(SMASH_TICK_MS * 4);
    const x = c.local!.x;
    c.receive(viewOf(fight(T + 4, 640, 1000)), SMASH_TICK_MS * 4);
    expect(c.local!.x).toBeGreaterThan(x + 5);
    expect(c.local!.x).toBeLessThan(x + 30);
    c.receive(viewOf(fight(T + 5, 1100, 1000)), SMASH_TICK_MS * 5);
    expect(c.local!.x).toBeGreaterThan(1000);
  });

  test("follows the server when your fighter is hit, and the server's damage and lives always", () => {
    const c = new FightClient(0, cast, "sketchbook");
    c.receive(viewOf(fight(T, 600, 1000)), 0);
    const hit = fight(T + 1, 640, 1000);
    Object.assign(hit.bodies[0]!, { stun: 10, vx: 20, vy: 12, gr: -1, dmg: 35, y: 230 });
    c.receive(viewOf(hit), SMASH_TICK_MS);
    expect(c.local).toMatchObject({ x: 640, dmg: 35, stun: 10 });
    c.advance(SMASH_TICK_MS * 3);
    expect(c.local!.x).toBeGreaterThan(660);
  });

  test("holds still while the match is paused, and picks up without a jump", () => {
    const c = new FightClient(0, cast, "sketchbook");
    c.receive(viewOf(fight(T, 600, 1000)), 0);
    c.input(KEY.right, false);
    c.hold(true, 0);
    c.advance(10_000);
    expect(c.local!.x).toBe(600);
    c.hold(false, 10_000);
    c.advance(10_000 + SMASH_TICK_MS);
    expect(c.localTick).toBe(T + 1);
  });
});

describe("your fighter between ticks", () => {
  test("glides on between predicted ticks instead of stepping 20 times a second", () => {
    const c = new FightClient(0, cast, "sketchbook");
    c.receive(viewOf(fight(T, 600, 1000)), 0);
    c.input(KEY.right, false);
    c.advance(4 * SMASH_TICK_MS);
    const onTick = c.frame(4 * SMASH_TICK_MS)!.bodies[0]!.x;
    const between = c.frame(4.5 * SMASH_TICK_MS)!.bodies[0]!.x;
    expect(onTick).toBeCloseTo(c.local!.x, 5);
    expect(between).toBeGreaterThan(onTick);
    c.advance(5 * SMASH_TICK_MS);
    expect(between).toBeLessThan(c.local!.x + 1e-9);
  });
});
