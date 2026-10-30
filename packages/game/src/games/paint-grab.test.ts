import { describe, expect, test } from "vitest";
import { paintGrabStroke, todoFor } from "../bots";
import {
  createMatch,
  reduceMatch,
  viewMatch,
  type MatchEvent,
  type MatchState,
  type MatchView,
} from "../match";
import { fixtures, players as makePlayers } from "../test-helpers";
import {
  PAINT_CELLS,
  PAINT_GRAB_POINTS,
  PAINT_H,
  PAINT_INK,
  PAINT_W,
  paintCounts,
  paintGrab,
  paintTouches,
  type PaintGrabState,
} from "./paint-grab";

const T0 = 1_000;
const players = makePlayers(4);
const c = (x: number, y: number) => y * PAINT_W + x;
/** The cells from `(x0, y0)` to `(x1, y1)` along a row or a column. */
function line(x0: number, y0: number, x1: number, y1: number): number[] {
  const cells: number[] = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) cells.push(c(x0 + Math.sign(x1 - x0) * i, y0 + Math.sign(y1 - y0) * i));
  return cells;
}
/** A closed square outline with its corner at `(x, y)`, walked clockwise back to the start. */
function square(x: number, y: number, side: number): number[] {
  const e = side - 1;
  return [
    ...line(x, y, x + e, y),
    ...line(x + e, y + 1, x + e, y + e),
    ...line(x + e - 1, y + e, x, y + e),
    ...line(x, y + e - 1, x, y),
  ];
}

function start(seed = 3) {
  let s = paintGrab.init({ players, content: {}, spice: "mild", seed, now: T0, pace: 1 }).state;
  let now = T0;
  return {
    get s(): PaintGrabState {
      return s;
    },
    get now() {
      return now;
    },
    /** Runs the clock to the next deadline. */
    tick() {
      now = Math.max(now, paintGrab.deadline(s)!);
      s = paintGrab.reduce(s, { type: "tick", now }).state;
    },
    /** Runs the clock to the painting. */
    toPaint() {
      while (s.phase !== "paint") this.tick();
    },
    wait(ms: number) {
      now += ms;
    },
    /** Paints strokes, after waiting long enough for the ink to be full again. */
    paint(playerId: string, ...strokes: number[][]) {
      now += 2_000;
      s = paintGrab.reduce(s, { type: "action", playerId, action: { type: "paint", strokes }, now }).state;
    },
    /** Paints without waiting. */
    rush(playerId: string, ...strokes: number[][]) {
      s = paintGrab.reduce(s, { type: "action", playerId, action: { type: "paint", strokes }, now }).state;
    },
    phase: () => s.phase,
    count: (id: string) =>
      paintCounts(
        s.grid,
        s.players.map((p) => p.id),
      )[id] ?? 0,
    at: (x: number, y: number) => s.grid[c(x, y)],
  };
}

describe("Paint Grab", () => {
  test("counts down, then paints a stroke in your colour, right over someone else's", () => {
    const g = start();
    expect(g.s.phase).toBe("ready");
    g.paint("p0", line(2, 2, 10, 2));
    expect(g.count("p0")).toBe(0);

    g.toPaint();
    g.paint("p0", line(2, 2, 10, 2));
    expect(g.count("p0")).toBe(9);
    expect(g.at(2, 2)).toBe("A");
    g.paint("p1", line(6, 0, 6, 4));
    expect(g.at(6, 2)).toBe("B");
    expect(g.count("p0")).toBe(8);
    expect(g.count("p1")).toBe(5);
    expect(paintGrab.stats(g.s).p1).toMatchObject({ paintedOver: 1 });
    expect(g.s.pens.p1!.last).toBe(c(6, 4));
  });

  test("refuses a batch with a gap in it, and leaves the canvas alone", () => {
    const g = start();
    g.toPaint();
    const before = g.s.grid;
    g.paint("p0", [c(1, 1), c(2, 1), c(4, 1)]);
    g.paint("p0", [c(1, 1), c(2, 2)]);
    // A row's last cell isn't next to the next row's first.
    g.paint("p0", [c(PAINT_W - 1, 3), c(0, 4)]);
    expect(g.s.grid).toBe(before);
    expect(g.s.pens.p0!.strokes).toBe(0);
    expect(paintGrab.actionSchema.safeParse({ type: "paint", strokes: [[PAINT_CELLS]] }).success).toBe(false);
    expect(
      paintGrab.actionSchema.safeParse({ type: "paint", strokes: [line(0, 0, 40, 0), line(0, 1, 40, 1)] })
        .success,
    ).toBe(false);
  });

  test("closing a loop fills it, over other colours too, but the canvas edge is no wall", () => {
    const g = start();
    g.toPaint();
    g.paint("p1", line(12, 12, 14, 12));
    // Three sides of a square: nothing fills yet.
    const walls = square(10, 10, 7);
    g.paint("p0", walls.slice(0, 20));
    expect(g.count("p0")).toBe(20);
    expect(g.at(13, 13)).toBe(".");
    // The last side closes it: the 5x5 inside fills, with p1's cells.
    g.paint("p0", walls.slice(19));
    expect(g.count("p0")).toBe(49);
    expect(g.at(12, 12)).toBe("A");
    expect(g.count("p1")).toBe(0);
    expect(g.s.events.at(-1)).toMatchObject({ kind: "fill", playerId: "p0", cells: 25, x: 13, y: 13 });
    expect(paintGrab.stats(g.s).p0).toMatchObject({ loopCells: 25 });

    // A wall from edge to edge cuts the canvas in two, but fills nothing.
    g.paint("p2", line(30, 0, 30, PAINT_H - 1));
    expect(g.count("p2")).toBe(PAINT_H);
  });

  test("only fills what this batch closed, not someone's island inside your old loop", () => {
    const g = start();
    g.toPaint();
    g.paint("p0", square(10, 10, 7));
    // p1 puts the brush down inside p0's area without crossing its wall.
    g.paint("p1", [c(13, 13)]);
    expect(g.at(13, 13)).toBe("B");
    g.paint("p0", line(30, 5, 35, 5));
    expect(g.at(13, 13)).toBe("B");
    // Painting next to it closes it off again.
    g.paint("p0", [c(12, 13)]);
    expect(g.at(13, 13)).toBe("A");
  });

  test("the brush runs on ink: a batch faster than the ink allows is cut short", () => {
    const g = start();
    g.toPaint();
    const full = PAINT_INK.max + PAINT_INK.slack;
    // The first cell puts the brush down, which costs extra.
    g.paint("p0", line(0, 5, 47, 5), line(47, 6, 47, 20));
    expect(g.count("p0")).toBe(full - PAINT_INK.strokeCost);
    // Right away, there's no ink left.
    g.rush("p0", line(0, 8, 10, 8));
    expect(g.s.pens.p0!.strokes).toBe(2);
    expect(g.at(0, 8)).toBe(".");
    // Half a second refills 18 cells, minus 3 to put the brush down somewhere new.
    g.wait(500);
    g.rush("p0", line(0, 10, 30, 10));
    expect(g.count("p0")).toBe(full - PAINT_INK.strokeCost + PAINT_INK.perSecond / 2 - PAINT_INK.strokeCost);
  });

  test("a paint pot appears, and grabbing it splats your colour", () => {
    const g = start();
    g.toPaint();
    expect(g.s.pot).toBeNull();
    g.tick();
    expect(g.s.phase).toBe("paint");
    const pot = g.s.pot!;
    expect(pot).not.toBeNull();
    const [x, y] = [pot % PAINT_W, Math.floor(pot / PAINT_W)];
    // Brushing past it, one cell off, still grabs it.
    g.paint("p2", [c(x + 1, y + 1)]);
    expect(g.s.pot).toBeNull();
    expect(g.count("p2")).toBeGreaterThan(30);
    expect(g.s.events.at(-1)).toMatchObject({ kind: "pot", playerId: "p2", x, y });
    expect(paintGrab.stats(g.s).p2).toMatchObject({ paintPots: 1 });
    // The next one comes a few seconds later.
    expect(paintGrab.deadline(g.s)).toBeLessThan(g.s.phaseEndsAt);
    g.tick();
    expect(g.s.pot).not.toBeNull();
  });

  test("scores each round by place and share, ties sharing the higher place, over two rounds", () => {
    const g = start();
    g.toPaint();
    g.paint("p0", square(2, 2, 10));
    g.paint("p1", square(20, 2, 10));
    g.paint("p2", line(2, 20, 11, 20));
    while (g.phase() === "paint") g.tick();
    expect(g.s.phase).toBe("reveal");
    const r = g.s.rounds[0]!;
    expect(r.counts).toEqual({ p0: 100, p1: 100, p2: 10, p3: 0 });
    expect(r.placing).toEqual(["p0", "p1", "p2", "p3"]);
    const pct = (n: number) => Math.floor((n * 100) / PAINT_CELLS) * PAINT_GRAB_POINTS.perPercent;
    expect(r.points).toEqual({
      p0: PAINT_GRAB_POINTS.place[0] + pct(100),
      p1: PAINT_GRAB_POINTS.place[0] + pct(100),
      p2: PAINT_GRAB_POINTS.place[2] + pct(10),
      p3: 0,
    });
    expect(paintGrab.view(g.s, "p0").rounds).toHaveLength(1);

    // Round two starts on a clean canvas.
    g.tick();
    expect(g.s.phase).toBe("ready");
    expect(g.s.round).toBe(1);
    expect(g.s.grid).not.toMatch(/[A-L]/);
    g.toPaint();
    g.paint("p3", line(0, 0, 9, 0));
    while (g.phase() === "paint") g.tick();
    expect(g.s.rounds[1]!.placing[0]).toBe("p3");
    g.tick();
    expect(g.s.phase).toBe("results");
    g.tick();
    expect(paintGrab.isOver(g.s)).toBe(true);
    expect(paintGrab.scores(g.s)).toEqual({
      p0: r.points.p0,
      p1: r.points.p1,
      p2: r.points.p2,
      p3: PAINT_GRAB_POINTS.place[0] + pct(10),
    });
  });

  test("a player who leaves keeps their paint but can't paint or place", () => {
    const g = start();
    g.toPaint();
    g.paint("p3", line(0, 0, 9, 0));
    const left = paintGrab.reduce(g.s, { type: "player_left", playerId: "p3", now: g.now }).state;
    const after = paintGrab.reduce(left, {
      type: "action",
      playerId: "p3",
      action: { type: "paint", strokes: [[c(0, 1)]] },
      now: g.now + 2000,
    }).state;
    expect(after.grid).toBe(left.grid);
    expect(paintCounts(after.grid, ["p0", "p1", "p2", "p3"]).p3).toBe(10);
    const ended = paintGrab.reduce(after, { type: "skip", now: g.now }).state;
    expect(ended.rounds[0]!.placing).not.toContain("p3");
  });

  test("the view names who paints each letter, and spectators have no brush", () => {
    const g = start();
    g.toPaint();
    g.paint("p1", [c(0, 0)]);
    const view = paintGrab.view(g.s, "p1");
    expect(view.order).toEqual(["p0", "p1", "p2", "p3"]);
    expect(view.grid).toHaveLength(PAINT_W * PAINT_H);
    expect(view.grid[0]).toBe("B");
    expect(view.counts.p1).toBe(1);
    expect(view.me).toMatchObject({ last: 0, strokes: 1 });
    expect(paintGrab.view(g.s, null).me).toBeNull();
    // Small enough to send every player several times a second.
    expect(JSON.stringify(view).length).toBeLessThan(2_500);
  });
});

describe("Paint Grab bots", () => {
  const room = (game: unknown): MatchView =>
    ({
      phase: "playing",
      index: 0,
      game: { gameId: "paint-grab", players: players.map((p) => p.id), view: game, deadline: null },
    }) as MatchView;

  test("keep painting: each batch carries on from the last one, a few times a second", () => {
    const g = start();
    g.toPaint();
    let strokes = 0;
    for (let i = 0; i < 40; i++) {
      const view = paintGrab.view(g.s, "p0");
      const todo = todoFor(room(view), "p0")!;
      expect(todo.steady && todo.timed).toBe(true);
      expect(todo.autoAt - view.me!.at).toBeGreaterThanOrEqual(250);
      expect(todo.autoAt - view.me!.at).toBeLessThanOrEqual(500);
      const action = todo.fallback() as { strokes: number[][] };
      const cells = action.strokes[0]!;
      if (view.me!.last !== null) expect(paintTouches(view.me!.last, cells[0]!)).toBe(true);
      cells.slice(1).forEach((cell, j) => expect(paintTouches(cells[j]!, cell)).toBe(true));
      g.wait(todo.autoAt - g.now);
      g.rush("p0", ...action.strokes);
      strokes += 1;
      expect(g.s.pens.p0!.strokes).toBe(strokes);
      // Every batch is a new hint, so bots and the autopilot know it's a new move.
      expect(todoFor(room(paintGrab.view(g.s, "p0")), "p0")!.hint).not.toBe(todo.hint);
    }
    // Their loops close, so they fill more than they draw.
    expect(paintGrab.stats(g.s).p0?.loopCells).toBeGreaterThan(0);
    expect(todoFor(room(paintGrab.view(g.s, null)), "p0")).toBeNull();
  });

  test("stay on the canvas wherever their brush is", () => {
    for (const last of [0, PAINT_W - 1, PAINT_CELLS - 1, PAINT_CELLS - PAINT_W]) {
      for (let strokes = 0; strokes < 60; strokes++) {
        const cells = paintGrabStroke(
          { width: PAINT_W, height: PAINT_H, round: 0, me: { last, at: 0, strokes } },
          "bot",
        );
        expect(cells.every((cell) => cell >= 0 && cell < PAINT_CELLS)).toBe(true);
        expect(paintTouches(last, cells[0]!)).toBe(true);
      }
    }
  });
});

describe("Paint Grab while paused", () => {
  test("refuses paint and holds the round's clock", () => {
    let state: MatchState = createMatch("PNTG", 5);
    const dispatch = (event: MatchEvent) => {
      const step = reduceMatch(state, event);
      state = step.state;
      for (const e of step.effects) {
        if (e.kind === "load_content")
          dispatch({
            type: "effect_result",
            effectId: e.id,
            result: { index: e.index, content: fixtures["paint-grab"] },
            now: event.now,
          });
      }
    };
    for (const p of makePlayers(3)) dispatch({ type: "join", player: p, now: T0 });
    dispatch({
      type: "settings",
      playerId: "p0",
      settings: { preset: "custom", custom: ["paint-grab"], spice: "mild" },
      now: T0,
    });
    dispatch({ type: "start", playerId: "p0", now: T0 });
    dispatch({ type: "next", playerId: "p0", now: T0 });
    const game = () => state.game!.state as PaintGrabState;
    dispatch({ type: "tick", now: game().phaseEndsAt });
    expect(game().phase).toBe("paint");
    const paintAt = (now: number) =>
      dispatch({
        type: "action",
        playerId: "p1",
        action: { type: "paint", strokes: [line(0, 0, 4, 0)] },
        now,
      });

    const pausedAt = game().phaseEndsAt - 20_000;
    dispatch({ type: "pause", playerId: "p0", now: pausedAt });
    paintAt(pausedAt + 1_000);
    dispatch({ type: "tick", now: pausedAt + 60_000 });
    expect(game().grid).not.toMatch(/B/);
    expect(game().phase).toBe("paint");

    dispatch({ type: "resume", playerId: "p0", now: pausedAt + 60_000 });
    const view = viewMatch(state, "p1", pausedAt + 60_000).game!.view as { endsAt: number };
    expect(view.endsAt - viewMatch(state, "p1", pausedAt + 60_000).serverNow).toBe(20_000);
    paintAt(pausedAt + 61_000);
    expect(paintCounts(game().grid, ["p0", "p1", "p2"]).p1).toBe(5);
  });
});
