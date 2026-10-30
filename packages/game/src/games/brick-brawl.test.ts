import { describe, expect, test } from "vitest";
import { brawlMove } from "../bots";
import { players as makePlayers } from "../test-helpers";
import {
  BRAWL_POINTS,
  brickBrawl,
  resolveTurn,
  type BrawlMove,
  type BrawlRound,
  type BrickBrawlState,
} from "./brick-brawl";

/** A 7x7 arena with bricks where the test puts them. */
function arena(
  bricks: Record<string, [number, number]>,
  moves: Record<string, BrawlMove> = {},
  turn = 0,
): BrawlRound {
  return {
    size: 7,
    ring: 0,
    turn,
    bricks: Object.entries(bricks).map(([id, [x, y]]) => ({ id, x, y, outAt: null, dazed: false })),
    moves,
    drops: {},
    events: [],
    roundPoints: {},
    placing: null,
  };
}
const where = (r: BrawlRound, id: string) => {
  const b = r.bricks.find((x) => x.id === id)!;
  return b.outAt === null ? [b.x, b.y] : "out";
};

describe("Brick Brawl turns", () => {
  test("steps move one tile, dashes two", () => {
    const r = arena(
      { a: [3, 3], b: [1, 1] },
      { a: { type: "step", dir: "up" }, b: { type: "dash", dir: "right" } },
    );
    resolveTurn(r, {});
    expect(where(r, "a")).toEqual([3, 2]);
    expect(where(r, "b")).toEqual([3, 1]);
  });

  test("two bricks heading for the same tile, or swapping, both bounce", () => {
    const r = arena(
      { a: [2, 3], b: [4, 3], c: [1, 1], d: [2, 1] },
      {
        a: { type: "step", dir: "right" },
        b: { type: "step", dir: "left" },
        c: { type: "step", dir: "right" },
        d: { type: "step", dir: "left" },
      },
    );
    resolveTurn(r, {});
    expect([where(r, "a"), where(r, "b"), where(r, "c"), where(r, "d")]).toEqual([
      [2, 3],
      [4, 3],
      [1, 1],
      [2, 1],
    ]);
  });

  test("a brick can follow one that's moving away", () => {
    const r = arena(
      { a: [2, 3], b: [3, 3] },
      { a: { type: "step", dir: "right" }, b: { type: "step", dir: "right" } },
    );
    resolveTurn(r, {});
    expect([where(r, "a"), where(r, "b")]).toEqual([
      [3, 3],
      [4, 3],
    ]);
  });

  test("a shove sends a brick two tiles, off the edge counts as a knockout", () => {
    const stats = {};
    const r = arena(
      { a: [3, 3], b: [4, 3], c: [5, 1], d: [5, 2] },
      { a: { type: "shove", dir: "right" }, d: { type: "shove", dir: "up" } },
    );
    const events = resolveTurn(r, stats);
    expect(where(r, "b")).toEqual([6, 3]);
    expect(where(r, "c")).toBe("out");
    expect(events).toContainEqual({ kind: "fall", id: "c", by: ["d"] });
    expect(r.roundPoints.d).toBe(BRAWL_POINTS.knockout);
    expect(stats).toMatchObject({ d: { knockouts: 1, shoves: 1 } });
  });

  test("a pushed brick stops at another brick", () => {
    const r = arena({ a: [1, 3], b: [2, 3], c: [4, 3] }, { a: { type: "shove", dir: "right" } });
    resolveTurn(r, {});
    expect(where(r, "b")).toEqual([3, 3]);
  });

  test("blocking shrugs off shoves", () => {
    const r = arena({ a: [5, 3], b: [6, 3] }, { a: { type: "shove", dir: "right" }, b: { type: "block" } });
    resolveTurn(r, {});
    expect(where(r, "b")).toEqual([6, 3]);
  });

  test("dashing into a brick rams it one tile and stops", () => {
    const r = arena({ a: [3, 3], b: [5, 3] }, { a: { type: "dash", dir: "right" } });
    const events = resolveTurn(r, {});
    expect([where(r, "a"), where(r, "b")]).toEqual([
      [4, 3],
      [6, 3],
    ]);
    expect(events).toContainEqual({ kind: "ram", by: "a", id: "b" });
  });

  test("walking off the edge is your own fault", () => {
    const r = arena({ a: [0, 3] }, { a: { type: "step", dir: "left" } });
    const events = resolveTurn(r, {});
    expect(where(r, "a")).toBe("out");
    expect(events).toContainEqual({ kind: "fall", id: "a", by: [] });
  });

  test("the outer ring crumbles every third turn, taking whoever stands on it", () => {
    const r = arena({ a: [0, 0], b: [3, 3] }, {}, 2);
    const events = resolveTurn(r, {});
    expect(r.ring).toBe(1);
    expect(events).toContainEqual({ kind: "shrink" });
    expect([where(r, "a"), where(r, "b")]).toEqual(["out", [3, 3]]);
  });

  test("a dropped brick dazes its target, who then skips a move", () => {
    const r = arena({ a: [3, 3], b: [1, 1] });
    r.bricks.push({ id: "ghost", x: 0, y: 0, outAt: 0, dazed: false });
    r.drops = { ghost: { x: 3, y: 3 } };
    resolveTurn(r, {});
    expect(r.bricks.find((b) => b.id === "a")!.dazed).toBe(true);
    expect(r.roundPoints.ghost).toBe(BRAWL_POINTS.hazardHit);
    r.drops = {};
    r.moves = { a: { type: "step", dir: "up" } };
    resolveTurn(r, {});
    expect(where(r, "a")).toEqual([3, 3]);
  });
});

describe("Brick Brawl game", () => {
  const players = makePlayers(4);
  const start = () =>
    brickBrawl.init({ players, content: {}, spice: "mild", seed: 9, now: 0, pace: 1 }).state;

  test("planning ends early once everyone standing has moved, and nobody sees others' moves", () => {
    let s: BrickBrawlState = start();
    for (const p of players.slice(0, 3))
      s = brickBrawl.reduce(s, { type: "action", playerId: p.id, action: { type: "stay" }, now: 1 }).state;
    expect(s.phase).toBe("plan");
    expect(brickBrawl.view(s, "p3").readyIds).toHaveLength(3);
    expect(brickBrawl.view(s, "p3").myMove).toBeNull();
    s = brickBrawl.reduce(s, { type: "action", playerId: "p3", action: { type: "block" }, now: 2 }).state;
    expect(s.phase).toBe("replay");
  });

  test("bots playing each other finish both rounds with placements", () => {
    let s: BrickBrawlState = start();
    let now = 0;
    let random = 0.3;
    const next = () => (random = (random * 9301 + 0.49297) % 1);
    for (let i = 0; i < 200 && !brickBrawl.isOver(s); i++) {
      if (s.phase === "plan") {
        for (const p of players) {
          const view = brickBrawl.view(s, p.id);
          s = brickBrawl.reduce(s, {
            type: "action",
            playerId: p.id,
            action: brawlMove(view, p.id, next),
            now,
          }).state;
          if (s.phase !== "plan") break;
        }
      }
      now = brickBrawl.deadline(s) ?? now;
      s = brickBrawl.reduce(s, { type: "tick", now }).state;
    }
    expect(brickBrawl.isOver(s)).toBe(true);
    for (const r of s.rounds) expect(r.placing).toHaveLength(players.length);
    expect(Object.values(s.points).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2 * (300 + 150 + 75));
  });

  test("bots don't walk off the edge or into the crumbling ring", () => {
    const r = arena({ me: [0, 3], other: [5, 5] }, {}, 2);
    const view = { ...brickBrawl.view({ ...start(), rounds: [r], roundIndex: 0 }, "me"), size: 7 };
    for (let i = 0; i < 20; i++) {
      const move = brawlMove(view, "me", Math.random);
      const sim = arena({ me: [0, 3], other: [5, 5] }, { me: move }, 2);
      resolveTurn(sim, {});
      expect(where(sim, "me")).not.toBe("out");
    }
  });
});
