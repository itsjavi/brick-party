import type { SmashFighterView } from "@brick/game";
import { describe, expect, test } from "vitest";
import { RosterKeeper } from "./roster";

const SPEC = {
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
} as const;
const fighter = (id: string, drawn = false): SmashFighterView =>
  ({
    id,
    name: `Fighter ${id}`,
    weapon: "blade",
    spec: SPEC,
    auto: false,
    ...(drawn ? { strokes: [], rig: {}, stats: {} } : {}),
  }) as unknown as SmashFighterView;

describe("RosterKeeper", () => {
  test("keeps the drawings between views that leave them out, and the same list while nothing changes", () => {
    const keeper = new RosterKeeper();
    expect(keeper.take({ fighters: [fighter("a", true), fighter("b", true)], drawingsVersion: 7 })).toBe(
      true,
    );
    const kept = keeper.fighters(7);
    expect(kept.every((f) => f.strokes)).toBe(true);
    // A roster without drawings, then a view with no roster at all.
    expect(keeper.take({ fighters: [fighter("a"), fighter("b")], drawingsVersion: 7 })).toBe(false);
    expect(keeper.take({ fighters: [], drawingsVersion: 7 })).toBe(false);
    expect(keeper.fighters(7)).toBe(kept);
  });

  test("hears when drawings arrive, and starts over for the next game's set", () => {
    const keeper = new RosterKeeper();
    keeper.take({ fighters: [fighter("a"), fighter("b")], drawingsVersion: 7 });
    expect(keeper.fighters(7).some((f) => f.strokes)).toBe(false);
    expect(keeper.take({ fighters: [fighter("a", true), fighter("b", true)], drawingsVersion: 7 })).toBe(
      true,
    );
    expect(keeper.fighters(9)).toEqual([]);
    expect(keeper.take({ fighters: [fighter("c")], drawingsVersion: 9 })).toBe(true);
    expect(keeper.fighters(9).map((f) => f.id)).toEqual(["c"]);
    expect(keeper.fighters(9)[0]!.strokes).toBeUndefined();
  });
});
