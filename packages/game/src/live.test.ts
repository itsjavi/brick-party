import { describe, expect, test } from "vitest";
import { createRng } from "./rng";
import { GO_TICK, KEY, SMASH_TICK_MS } from "./games/smash-sim";
import { randomSmashFighter, type DoodleSmashState } from "./games/doodle-smash";
import {
  TEST_BOTS,
  createMatch,
  createTestMatch,
  liveTickMs,
  nextDeadline,
  reduceMatch,
  viewMatch,
  type MatchEvent,
  type MatchState,
} from "./match";
import { players } from "./test-helpers";
import type { PlayerInfo } from "./types";

// The test runner has these; the package's types leave them out (globals.d.ts).
declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

const T0 = 1_000_000;

/** A room of `n` people playing Doodle Smash, at the start of the fight. */
function fighting(n: number) {
  let state: MatchState = createMatch("SMSH", 5);
  const dispatch = (event: MatchEvent) => {
    const step = reduceMatch(state, event);
    state = step.state;
    for (const e of step.effects) {
      if (e.kind === "load_content")
        dispatch({
          type: "effect_result",
          effectId: e.id,
          result: { index: e.index, content: {} },
          now: event.now,
        });
    }
  };
  const people = players(n);
  for (const p of people) dispatch({ type: "join", player: p, now: T0 });
  dispatch({
    type: "settings",
    playerId: "p0",
    settings: { preset: "custom", custom: ["doodle-smash"], spice: "mild" },
    now: T0,
  });
  dispatch({ type: "start", playerId: "p0", now: T0 });
  dispatch({ type: "next", playerId: "p0", now: T0 });
  const rng = createRng(3);
  for (const p of people)
    dispatch({
      type: "action",
      playerId: p.id,
      action: { type: "fighter", ...randomSmashFighter(rng.next) },
      now: T0,
    });
  const game = () => state.game!.state as DoodleSmashState;
  dispatch({ type: "tick", now: game().phaseEndsAt });
  expect(game().phase).toBe("fight");
  return {
    get state() {
      return state;
    },
    game,
    dispatch,
    people,
    start: game().fightStartedAt,
  };
}

describe("live games", () => {
  test("tick live only during the fight, and not while paused; a pause holds the fight and the clock", () => {
    const room = fighting(3);
    expect(liveTickMs(room.state)).toBe(SMASH_TICK_MS);
    const at = (tick: number) => room.start + tick * SMASH_TICK_MS + 1;
    for (let t = 1; t <= GO_TICK + 20; t++) room.dispatch({ type: "tick", now: at(t) });
    expect(room.game().fight!.tick).toBe(GO_TICK + 20);
    room.dispatch({
      type: "action",
      playerId: "p1",
      action: { type: "input", held: KEY.right, seq: 1 },
      now: at(GO_TICK + 20),
    });

    room.dispatch({ type: "pause", playerId: "p0", now: at(GO_TICK + 20) });
    expect(liveTickMs(room.state)).toBeNull();
    const held = room.game();
    room.dispatch({ type: "tick", now: at(GO_TICK + 400) });
    room.dispatch({
      type: "action",
      playerId: "p1",
      action: { type: "input", held: KEY.left, seq: 2 },
      now: at(GO_TICK + 400),
    });
    expect(room.game()).toEqual(held);

    // After a 20 second pause, the fight goes on from where it was, without racing through the time paused.
    room.dispatch({ type: "resume", playerId: "p0", now: at(GO_TICK + 420) });
    expect(liveTickMs(room.state)).toBe(SMASH_TICK_MS);
    room.dispatch({ type: "tick", now: at(GO_TICK + 422) });
    expect(room.game().fight!.tick).toBe(GO_TICK + 22);
    expect(room.game().fight!.bodies[1]!.held).toBe(KEY.right);
  });

  test("ticks and moves copy only the fight, and moves from outside the fight are ignored", () => {
    const room = fighting(3);
    const before = room.state;
    room.dispatch({ type: "tick", now: room.start + 5 * SMASH_TICK_MS });
    expect(room.state).not.toBe(before);
    expect(room.state.members).toBe(before.members);
    expect(room.game().fighters).toBe((before.game!.state as DoodleSmashState).fighters);
    const now = room.state;
    room.dispatch({
      type: "action",
      playerId: "stranger",
      action: { type: "input", held: 1, seq: 1 },
      now: room.start + 300,
    });
    room.dispatch({
      type: "action",
      playerId: "p0",
      action: { type: "input", held: 99, seq: 1 },
      now: room.start + 300,
    });
    expect(room.state).toBe(now);
  });

  test("the fight's deadline still ends it through the room's alarm", () => {
    const room = fighting(3);
    expect(nextDeadline(room.state)).toBe(room.game().phaseEndsAt);
    room.dispatch({ type: "tick", now: room.game().phaseEndsAt });
    expect(room.game().phase).toBe("results");
    expect(liveTickMs(room.state)).toBeNull();
  });

  test("views say when the game is live, so screens can draw it outside React", () => {
    const room = fighting(3);
    expect(viewMatch(room.state, "p0", room.start).live).toBe(true);
    room.dispatch({ type: "tick", now: room.game().phaseEndsAt });
    expect(viewMatch(room.state, "p0", room.game().phaseStartedAt).live).toBe(false);
  });

  test("a tick stays far under the Worker's CPU limit with twelve fighters", () => {
    const room = fighting(12);
    const at = (tick: number) => room.start + tick * SMASH_TICK_MS + 1;
    const rng = createRng(8);
    const ticks = 1200;
    let views = 0;
    let bytes = 0;
    const began = performance.now();
    for (let t = 1; t <= ticks; t++) {
      // Everyone mashes keys a few times a second, as people would.
      for (const p of room.people) {
        if (rng.next() < 0.3)
          room.dispatch({
            type: "action",
            playerId: p.id,
            action: {
              type: "input",
              held: rng.int(32),
              attack: rng.next() < 0.5 ? "press" : "release",
              seq: t,
            },
            now: at(t),
          });
      }
      room.dispatch({ type: "tick", now: at(t) });
      // A broadcast about every 66 ms: everyone's view.
      if (t % 4 !== 0) {
        for (const p of room.people)
          bytes += JSON.stringify({ type: "state", view: viewMatch(room.state, p.id, at(t)) }).length;
        views += 1;
      }
    }
    const ms = (performance.now() - began) / ticks;
    console.log(
      `Doodle Smash, 12 fighters: ${ms.toFixed(3)} ms per tick (with inputs and ${((views / ticks) * 12).toFixed(1)} views each), views ${Math.round(bytes / views / 12)} bytes`,
    );
    expect(room.game().fight!.tick).toBe(ticks);
    expect(ms).toBeLessThan(5);
  });
});

/** A "Test it" room for Doodle Smash with its person, past the rules screen. */
function testRoom() {
  let state = createTestMatch("TEST", 7, "doodle-smash");
  const dispatch = (event: MatchEvent) => {
    const step = reduceMatch(state, event);
    state = step.state;
    for (const e of step.effects) {
      if (e.kind === "load_content")
        dispatch({
          type: "effect_result",
          effectId: e.id,
          result: { index: e.index, content: {} },
          now: event.now,
        });
    }
  };
  const person: PlayerInfo = players(1)[0]!;
  dispatch({ type: "join", player: person, now: T0 });
  dispatch({ type: "ready", playerId: person.id, now: T0 });
  return {
    get state() {
      return state;
    },
    set state(s: MatchState) {
      state = s;
    },
    dispatch,
    person,
  };
}

describe("Doodle Smash in a test room", () => {
  test("bots draw fighters and fight live until the game ends", () => {
    const room = testRoom();
    const { dispatch, person } = room;
    let now = T0;
    let last: DoodleSmashState | undefined;
    let seenFight = false;
    for (let i = 0; i < 20_000 && room.state.phase !== "report"; i++) {
      const tickMs = liveTickMs(room.state);
      seenFight ||= tickMs !== null;
      now = tickMs ? now + tickMs : Math.max(now + 1, nextDeadline(room.state) ?? now);
      dispatch({ type: "tick", now });
      if (room.state.game) last = room.state.game.state as DoodleSmashState;
    }
    expect(room.state.phase).toBe("report");
    expect(seenFight).toBe(true);
    // The bots drew their own fighters; the person didn't, so the game drew one for them.
    expect(last!.fighters.map((f) => [f.id, f.auto])).toEqual([
      ...TEST_BOTS.map((b) => [b.id, false]),
      [person.id, true],
    ]);
    const tally = last!.fight!.tally;
    expect(tally.reduce((n, t) => n + t.kos, 0)).toBeGreaterThan(0);
    expect(last!.placing).toHaveLength(4);
    // The person never moved, and is easy pickings.
    expect(last!.placing!.at(-1)).toBe(person.id);
    const view = viewMatch(room.state, person.id, now);
    expect(view.report?.players).toHaveLength(4);
  });

  test("bots stand still when nobody is left in the room", () => {
    const room = testRoom();
    const game = () => room.state.game!.state as DoodleSmashState;
    room.dispatch({ type: "tick", now: game().phaseEndsAt + 2000 });
    room.dispatch({ type: "tick", now: game().phaseEndsAt });
    expect(game().phase).toBe("fight");
    room.state = {
      ...room.state,
      members: room.state.members.map((m) =>
        m.id === room.person.id ? { ...m, status: "left" as const } : m,
      ),
    };
    const start = game().fightStartedAt;
    for (let t = 1; t < GO_TICK + 40; t++) room.dispatch({ type: "tick", now: start + t * SMASH_TICK_MS });
    expect(game().fight!.tick).toBe(GO_TICK + 39);
    expect(game().fight!.bodies.every((b) => b.held === 0 && !b.atkHeld)).toBe(true);
  });
});
