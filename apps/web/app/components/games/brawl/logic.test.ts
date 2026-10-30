import type { BrawlBrick, BrawlEvent, BrickBrawlView } from "@brick/game";
import { describe, expect, test } from "vitest";
import {
  ghostsOf,
  moodOf,
  replayFrames,
  ringShown,
  sameMove,
  simulate,
  stageAt,
  stageShakes,
  stageSounds,
  stagesOf,
  threats,
  tileMoves,
} from "./logic";

const brick = (id: string, x: number, y: number, extra: Partial<BrawlBrick> = {}): BrawlBrick => ({
  id,
  x,
  y,
  outAt: null,
  dazed: false,
  ...extra,
});

function view(bricks: BrawlBrick[], extra: Partial<BrickBrawlView> = {}): BrickBrawlView {
  return {
    phase: "plan",
    endsAt: 0,
    round: 0,
    totalRounds: 2,
    turn: 0,
    maxTurns: 12,
    size: 7,
    ring: 0,
    crumbles: false,
    bricks,
    readyIds: [],
    myMove: null,
    myDrop: null,
    events: [],
    placing: null,
    roundPoints: {},
    points: {},
    ...extra,
  };
}

/** A turn where a steps, b shoves c off the edge, d drops a brick on a, and the edge crumbles. */
const EVENTS: BrawlEvent[] = [
  { kind: "block", id: "e" },
  { kind: "move", id: "a", to: [3, 2] },
  { kind: "bump", id: "f" },
  { kind: "shove", by: "b", id: "c" },
  { kind: "move", id: "c", to: [1, 5] },
  { kind: "move", id: "c", to: [0, 5] },
  { kind: "move", id: "c", to: [-1, 5] },
  { kind: "fall", id: "c", by: ["b"] },
  { kind: "drop", by: "d", x: 3, y: 2, hit: "a" },
  { kind: "shrink" },
  { kind: "fall", id: "e", by: [] },
];

describe("Brick Brawl replay staging", () => {
  test("events land in four beats: moves, shoves, dropped bricks, then the edge", () => {
    const stages = stagesOf(EVENTS);
    expect(stages.map((s) => s.map((e) => e.kind))).toEqual([
      ["block", "move", "bump"],
      ["shove", "move", "move", "move", "fall"],
      ["drop"],
      ["shrink", "fall"],
    ]);
  });

  test("a quiet turn still has four beats", () => {
    expect(stagesOf([{ kind: "move", id: "a", to: [1, 1] }]).map((s) => s.length)).toEqual([1, 0, 0, 0]);
  });

  test("each beat starts on the old schedule", () => {
    expect([
      stageAt(0),
      stageAt(149),
      stageAt(150),
      stageAt(999),
      stageAt(1000),
      stageAt(1850),
      stageAt(2600),
      stageAt(4000),
    ]).toEqual([-1, -1, 0, 0, 1, 2, 3, 3]);
  });

  test("bricks stand where each beat leaves them, from where they stood when moves were picked", () => {
    const before = [brick("a", 3, 3), brick("b", 3, 5), brick("c", 2, 5), brick("e", 0, 0)];
    const frames = replayFrames(before, EVENTS, 4);
    const at = (frame: BrawlBrick[], id: string) => frame.find((b) => b.id === id)!;
    expect(frames).toHaveLength(4);
    expect([at(frames[0]!, "a").x, at(frames[0]!, "a").y]).toEqual([3, 2]);
    expect(at(frames[0]!, "c")).toMatchObject({ x: 2, y: 5, outAt: null });
    expect(at(frames[1]!, "c")).toMatchObject({ x: -1, y: 5, outAt: 4 });
    expect(at(frames[1]!, "a").dazed).toBe(false);
    expect(at(frames[2]!, "a").dazed).toBe(true);
    expect(at(frames[2]!, "e").outAt).toBeNull();
    expect(at(frames[3]!, "e").outAt).toBe(4);
    // The bricks it started from are left alone.
    expect(before[0]).toMatchObject({ x: 3, y: 3, dazed: false });
  });

  test("events about bricks the screen doesn't know are skipped", () => {
    expect(() => replayFrames([], EVENTS, 0)).not.toThrow();
  });

  test("each beat plays each of its sounds once, and only hits shake the arena", () => {
    const stages = stagesOf(EVENTS);
    expect(stageSounds(stages[0]!)).toEqual(["shield", "bump"]);
    expect(stageSounds(stages[1]!)).toEqual(["thud", "fall"]);
    expect(stageSounds([{ kind: "move", id: "a", to: [0, 0] }])).toEqual([]);
    expect(stages.map(stageShakes)).toEqual([false, true, false, false]);
  });

  test("the edge stays until the last beat of a replay that crumbles it", () => {
    const replay = view([], { phase: "replay", ring: 1, events: EVENTS });
    expect([ringShown(replay, -1), ringShown(replay, 2), ringShown(replay, 3)]).toEqual([0, 0, 1]);
    expect(ringShown(view([], { phase: "results", ring: 1, events: EVENTS }), null)).toBe(1);
    expect(ringShown(view([], { phase: "replay", ring: 1, events: [] }), 0)).toBe(1);
  });
});

describe("Brick Brawl targets and previews", () => {
  test("each direction targets the tile one step, or two for a dash, away", () => {
    const steps = tileMoves({ x: 3, y: 3 }, "step");
    expect([...steps.keys()].sort()).toEqual(["2,3", "3,2", "3,4", "4,3"]);
    expect(steps.get("3,2")).toEqual({ type: "step", dir: "up" });
    expect(tileMoves({ x: 3, y: 3 }, "dash").get("5,3")).toEqual({ type: "dash", dir: "right" });
    expect(tileMoves({ x: 3, y: 3 }, "block").size).toBe(0);
    expect(tileMoves(null, "step").size).toBe(0);
  });

  test("moves match by type and direction", () => {
    expect(sameMove({ type: "step", dir: "up" }, { type: "step", dir: "up" })).toBe(true);
    expect(sameMove({ type: "step", dir: "up" }, { type: "dash", dir: "up" })).toBe(false);
    expect(sameMove({ type: "block" }, { type: "block" })).toBe(true);
    expect(sameMove({ type: "block" }, null)).toBe(false);
  });

  test("ghosts show where a shove would send a neighbor, and that it falls off", () => {
    const v = view([brick("me", 2, 3), brick("them", 1, 3), brick("far", 5, 5)]);
    const ghosts = ghostsOf(simulate(v, "me", { type: "shove", dir: "left" }), v.bricks, v.size);
    expect(ghosts).toEqual([{ id: "them", x: -1, y: 3, falls: true }]);
  });

  test("a step makes one ghost of yourself, and standing still makes none", () => {
    const v = view([brick("me", 2, 3), brick("them", 5, 5)]);
    expect(ghostsOf(simulate(v, "me", { type: "step", dir: "down" }), v.bricks, v.size)).toEqual([
      { id: "me", x: 2, y: 4, falls: false },
    ]);
    expect(ghostsOf(simulate(v, "me", { type: "block" }), v.bricks, v.size)).toEqual([]);
  });

  test("a neighbor is a threat only when a shove from it reaches past the edge", () => {
    const edge = view([brick("me", 1, 3), brick("them", 2, 3)]);
    expect(threats(edge, edge.bricks[0]!)).toEqual(["them"]);
    const middle = view([brick("me", 3, 3), brick("them", 4, 3)]);
    expect(threats(middle, middle.bricks[0]!)).toEqual([]);
    const crumbling = view([brick("me", 2, 3), brick("them", 3, 3)], { crumbles: true });
    expect(threats(crumbling, crumbling.bricks[0]!)).toEqual(["them"]);
  });

  test("faces follow what's happening, worst first", () => {
    const calm = { out: false, dazed: false, hit: false, bumped: false, threatened: false };
    expect(moodOf(calm)).toBe("happy");
    expect(moodOf({ ...calm, threatened: true })).toBe("wow");
    expect(moodOf({ ...calm, hit: true, dazed: true })).toBe("sleepy");
    expect(moodOf({ ...calm, out: true, dazed: true })).toBe("sad");
  });
});
