import { describe, expect, test } from "vitest";
import { inOrderWait, todoFor } from "../bots";
import type { MatchView } from "../match";
import { players as makePlayers } from "../test-helpers";
import { IN_ORDER_LIVES, IN_ORDER_POINTS, inOrder, type InOrderState } from "./in-order";

const T0 = 1_000;
const players = makePlayers(4);

function start(seed = 5) {
  let s = inOrder.init({ players, content: {}, spice: "mild", seed, now: T0, pace: 1 }).state;
  let now = T0;
  return {
    get s(): InOrderState {
      return s;
    },
    get now() {
      return now;
    },
    /** Runs the clock to the end of the current phase. */
    tick() {
      now = Math.max(now, inOrder.deadline(s)!);
      s = inOrder.reduce(s, { type: "tick", now }).state;
    },
    play(playerId: string, card = s.hands[playerId]![0]!, at = now) {
      now = at;
      s = inOrder.reduce(s, { type: "action", playerId, action: { type: "play", card }, now }).state;
    },
    leave(playerId: string) {
      s = inOrder.reduce(s, { type: "player_left", playerId, now }).state;
    },
    /** Clears levels perfectly until `level` is being played. */
    reach(level: number) {
      for (;;) {
        if (s.phase !== "play") this.tick();
        else if (s.level < level) this.playInOrder();
        else return;
      }
    },
    /** Every card left, in rising order: a perfect level. */
    playInOrder() {
      const cards = Object.entries(s.hands)
        .flatMap(([id, hand]) => hand.map((card) => ({ id, card })))
        .sort((a, b) => a.card - b.card);
      for (const c of cards) this.play(c.id, c.card);
    },
  };
}

/** The player holding the lowest card, and the one holding the highest. */
function lowHigh(s: InOrderState) {
  const all = Object.entries(s.hands).flatMap(([id, hand]) => hand.map((card) => ({ id, card })));
  all.sort((a, b) => a.card - b.card);
  return { low: all[0]!, high: all.at(-1)! };
}

describe("In Order", () => {
  test("each level deals one more card to everyone, all different, lowest first", () => {
    const g = start();
    for (let level = 0; level < 3; level++) {
      expect(g.s.phase).toBe("ready");
      const hands = Object.values(g.s.hands);
      expect(hands.every((h) => h.length === level + 1)).toBe(true);
      expect(hands.every((h) => h.every((c, i) => i === 0 || h[i - 1]! < c))).toBe(true);
      const all = hands.flat();
      expect(new Set(all).size).toBe(all.length);
      expect(all.every((c) => c >= 1 && c <= 100)).toBe(true);
      g.tick();
      g.playInOrder();
      if (level < 2) {
        expect(g.s.phase).toBe("levelEnd");
        g.tick();
      }
    }
    expect(g.s.phase).toBe("results");
  });

  test("you see your own cards, and only how many everyone else holds", () => {
    const g = start();
    g.tick();
    g.tick();
    g.playInOrder();
    g.tick();
    expect(g.s.level).toBe(1);
    for (const p of players) {
      const view = inOrder.view(g.s, p.id);
      expect(view.hand).toEqual(g.s.hands[p.id]);
      expect(view.holding).toEqual({ p0: 2, p1: 2, p2: 2, p3: 2 });
      expect(view.leftover).toEqual([]);
      // Nothing in the view carries another player's cards.
      const others = players.filter((o) => o.id !== p.id).flatMap((o) => g.s.hands[o.id]!);
      const { hand: _hand, ...rest } = view;
      const numbers =
        JSON.stringify({ ...rest, points: {}, endsAt: 0, startedAt: 0, since: 0 }).match(/\d+/g) ?? [];
      for (const card of others) expect(numbers).not.toContain(String(card));
    }
    expect(inOrder.view(g.s, null).hand).toBeNull();
  });

  test("cards can't be played during the countdown, and only your lowest one", () => {
    const g = start();
    g.reach(1);
    g.playInOrder();
    g.tick();
    expect([g.s.phase, g.s.level]).toEqual(["ready", 2]);
    const [low, high] = g.s.hands.p0!;
    g.play("p0", low);
    expect(g.s.plays).toHaveLength(0);
    g.tick();
    g.play("p0", high!);
    expect(g.s.plays).toHaveLength(0);
    g.play("p0", low!);
    g.play("p0", low!);
    expect(g.s.plays.filter((x) => x.card === low)).toHaveLength(1);
    expect(g.s.hands.p0).toHaveLength(2);
  });

  test("a perfect level pays everyone the same", () => {
    const g = start();
    g.tick();
    g.playInOrder();
    expect(g.s.outcome).toBe("cleared");
    expect(g.s.lives).toBe(IN_ORDER_LIVES);
    expect(g.s.points).toEqual({ p0: 100, p1: 100, p2: 100, p3: 100 });
    expect(inOrder.view(g.s, "p0").levelPoints).toBe(IN_ORDER_POINTS.level[0]);
  });

  test("playing too early costs a life and throws away every lower card, for everyone to see", () => {
    const g = start();
    g.tick();
    const { high } = lowHigh(g.s);
    g.play(high.id, high.card);
    expect(g.s.lives).toBe(IN_ORDER_LIVES - 1);
    const play = g.s.plays[0]!;
    expect(play.card).toBe(high.card);
    expect(play.burned).toHaveLength(3);
    expect(play.burned.map((b) => b.card)).toEqual([...play.burned.map((b) => b.card)].sort((a, b) => a - b));
    expect(inOrder.view(g.s, "p0").plays[0]!.burned).toEqual(play.burned);
    expect(g.s.stats[high.id]).toMatchObject({ tooEarly: 1 });
    for (const b of play.burned) expect(g.s.stats[b.playerId]).toMatchObject({ heldTooLong: 1 });
    // Nothing is left to play, and the team survived: the level still counts.
    expect(g.s.outcome).toBe("cleared");
    expect(g.s.points.p0).toBe(100);
  });

  test("a card played above only some held cards burns just those", () => {
    const g = start();
    g.reach(1);
    const cards = Object.entries(g.s.hands)
      .flatMap(([id, hand]) => hand.map((card) => ({ id, card })))
      .sort((a, b) => a.card - b.card);
    // The third-lowest card goes first, skipping two.
    const third = cards.find((c, i) => i >= 2 && cards.slice(0, i).every((x) => x.id !== c.id))!;
    g.play(third.id, third.card);
    const skipped = cards.filter((c) => c.card < third.card);
    expect(g.s.plays[0]!.burned.map((b) => b.card)).toEqual(skipped.map((c) => c.card));
    expect(g.s.lives).toBe(IN_ORDER_LIVES - 1);
    expect(g.s.phase).toBe("play");
    expect(inOrder.view(g.s, "p0").top).toBe(third.card);
  });

  test("losing the last life ends the game at once", () => {
    const g = start();
    for (let level = 0; level < 3 && g.s.phase !== "results"; level++) {
      g.tick();
      // The lowest card that's highest jumps ahead, then the rest go in order.
      const id = Object.keys(g.s.hands).sort((a, b) => g.s.hands[b]![0]! - g.s.hands[a]![0]!)[0]!;
      g.play(id);
      if (g.s.phase === "play") g.playInOrder();
      if (g.s.phase === "levelEnd") g.tick();
    }
    expect(g.s.lives).toBe(0);
    expect(g.s.phase).toBe("results");
    expect(g.s.outcome).toBe("wiped");
    // The first two levels were survived; the third wasn't.
    expect(g.s.levelsCleared).toBe(2);
    expect(g.s.points.p0).toBe(100 + 200);
    g.tick();
    expect(inOrder.isOver(g.s)).toBe(true);
  });

  test("running out of time costs a life, ends the level and shows the cards nobody played", () => {
    const g = start();
    g.tick();
    const { low } = lowHigh(g.s);
    g.play(low.id, low.card);
    g.tick();
    expect(g.s.outcome).toBe("timeout");
    expect(g.s.lives).toBe(IN_ORDER_LIVES - 1);
    expect(g.s.points.p0).toBe(0);
    const view = inOrder.view(g.s, "p0");
    expect(view.leftover).toHaveLength(3);
    expect(view.holding).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
  });

  test("plays every level to the end on timers alone, inside five minutes", () => {
    const g = start();
    while (!inOrder.isOver(g.s)) g.tick();
    expect(g.s.lives).toBe(0);
    expect(g.now - T0).toBeLessThan(5 * 60_000);
  });

  test("a perfect game pays a bonus for the lives left", () => {
    const g = start();
    for (let level = 0; level < 3; level++) {
      g.tick();
      g.playInOrder();
      if (level < 2) g.tick();
    }
    expect(g.s.points.p0).toBe(100 + 200 + 300 + IN_ORDER_LIVES * IN_ORDER_POINTS.lifeLeft);
    expect(new Set(Object.values(g.s.points)).size).toBe(1);
  });

  test("a player who leaves takes their cards along, and the level can still clear", () => {
    const g = start();
    g.tick();
    const { high } = lowHigh(g.s);
    const others = players
      .filter((p) => p.id !== high.id)
      .map((p) => ({ id: p.id, card: g.s.hands[p.id]![0]! }));
    for (const c of others.sort((a, b) => a.card - b.card)) g.play(c.id, c.card);
    expect(g.s.phase).toBe("play");
    g.leave(high.id);
    expect(g.s.outcome).toBe("cleared");
    expect(g.s.points[high.id]).toBe(0);
    expect(g.s.points[others[0]!.id]).toBe(100);
    g.tick();
    expect(g.s.hands[high.id]).toBeUndefined();
    expect(Object.keys(g.s.hands)).toHaveLength(3);
  });

  test("the host skipping a level costs no life", () => {
    const g = start();
    g.tick();
    const skipped = inOrder.reduce(g.s, { type: "skip", now: g.now }).state;
    expect(skipped.outcome).toBe("timeout");
    expect(skipped.lives).toBe(IN_ORDER_LIVES);
  });
});

/** A room view around a game view, for `todoFor`. */
function room(view: unknown, me: string): MatchView {
  return {
    phase: "playing",
    index: 0,
    you: me,
    game: { gameId: "in-order", players: players.map((p) => p.id), view, deadline: null },
  } as unknown as MatchView;
}

describe("In Order bots", () => {
  test("wait longer for bigger gaps to the pile, scaled to the level", () => {
    const v = { endsAt: 61_000, startedAt: 1_000, top: 20, round: 0 };
    expect(inOrderWait(v, 25, "a")).toBeLessThan(inOrderWait(v, 60, "a"));
    expect(inOrderWait(v, 60, "a")).toBeLessThan(inOrderWait(v, 99, "a"));
    // Even a gap of 99 leaves most of the level.
    expect(inOrderWait({ ...v, top: 0 }, 99, "a")).toBeLessThan(25_000);
    // Twice the pace, twice as fast.
    expect(inOrderWait({ ...v, endsAt: 31_000 }, 60, "a")).toBeCloseTo(inOrderWait(v, 60, "a") / 2, -2);
  });

  test("time each play from the last change to the pile, and play every card in turn", () => {
    const g = start();
    g.reach(2);
    const due = (id: string) => todoFor(room(inOrder.view(g.s, id), id), id);
    const holder = players.find((p) => g.s.hands[p.id]!.length)!.id;
    const todo = due(holder)!;
    expect(todo.timed).toBe(true);
    expect(todo.fallback()).toEqual({ type: "play", card: g.s.hands[holder]![0] });
    expect(todo.autoAt).toBeGreaterThan(g.s.since);
    // Bots playing each other: whoever's moment comes first plays, until the level is over.
    for (let i = 0; i < 20 && g.s.phase === "play"; i++) {
      const next = players
        .map((p) => ({ id: p.id, todo: due(p.id) }))
        .filter((x) => x.todo)
        .sort((a, b) => a.todo!.autoAt - b.todo!.autoAt)[0]!;
      g.play(next.id, next.todo!.fallback()!.card as number, next.todo!.autoAt);
    }
    expect(g.s.plays.length + g.s.plays.reduce((n, p) => n + p.burned.length, 0)).toBe(12);
    expect(g.s.phase).toBe("results");
    // Calm bots mostly keep the order.
    expect(g.s.plays.filter((p) => p.burned.length).length).toBeLessThanOrEqual(1);
  });

  test("have nothing to do during the countdown or with an empty hand", () => {
    const g = start();
    expect(todoFor(room(inOrder.view(g.s, "p0"), "p0"), "p0")).toBeNull();
    g.tick();
    g.playInOrder();
    expect(todoFor(room(inOrder.view(g.s, "p0"), "p0"), "p0")).toBeNull();
  });
});
