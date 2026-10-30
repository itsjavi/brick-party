import { describe, expect, test } from "vitest";
import { GAMES } from "./games";
import {
  MAX_PAUSE_MS,
  createMatch,
  nextDeadline,
  reduceMatch,
  viewMatch,
  type MatchEvent,
  type MatchState,
} from "./match";
import { fixtures, players } from "./test-helpers";
import { GAME_IDS, type GameId } from "./types";

const T0 = 1_000_000;

/** A three-player room playing `gameId`, already past the rules screen. */
function playing(gameId: GameId) {
  let state: MatchState = createMatch("BRCK", 5);
  const dispatch = (event: MatchEvent) => {
    const step = reduceMatch(state, event);
    state = step.state;
    for (const e of step.effects) {
      if (e.kind === "load_content") {
        dispatch({
          type: "effect_result",
          effectId: e.id,
          result: { index: e.index, content: fixtures[e.request.gameId] },
          now: event.now,
        });
      }
    }
  };
  for (const p of players(3)) dispatch({ type: "join", player: p, now: T0 });
  dispatch({
    type: "settings",
    playerId: "p0",
    settings: { preset: "custom", custom: [gameId], spice: "mild" },
    now: T0,
  });
  dispatch({ type: "start", playerId: "p0", now: T0 });
  dispatch({ type: "next", playerId: "p0", now: T0 });
  return {
    get state() {
      return state;
    },
    dispatch,
  };
}

const left = (s: MatchState, now: number) => {
  const view = viewMatch(s, "p0", now);
  return view.game!.deadline! - view.serverNow;
};

describe("pausing", () => {
  test.each(GAME_IDS)("%s keeps the time that was left, and no deadline passes while paused", (gameId) => {
    const room = playing(gameId);
    expect(room.state.phase).toBe("playing");
    const before = room.state.game!.state;
    const leftAtPause = left(room.state, T0 + 3_000);
    room.dispatch({ type: "pause", playerId: "p0", now: T0 + 3_000 });
    expect(viewMatch(room.state, "p1", T0 + 3_000).paused).toBe(true);

    // Long past the game's deadline, but still paused: the room only wakes when the pause runs out.
    expect(nextDeadline(room.state)).toBe(T0 + 3_000 + MAX_PAUSE_MS);
    room.dispatch({ type: "tick", now: T0 + 5 * 60_000 });
    room.dispatch({ type: "action", playerId: "p1", action: { type: "nonsense" }, now: T0 + 5 * 60_000 });
    expect(room.state.game!.state).toEqual(before);
    expect(left(room.state, T0 + 5 * 60_000)).toBe(leftAtPause);

    room.dispatch({ type: "resume", playerId: "p0", now: T0 + 6 * 60_000 });
    const view = viewMatch(room.state, "p1", T0 + 6 * 60_000);
    expect(view.paused).toBe(false);
    expect(view.clockEpoch).toBe(6 * 60_000 - 3_000);
    expect(left(room.state, T0 + 6 * 60_000)).toBe(leftAtPause);
    expect(nextDeadline(room.state)).toBe(
      T0 +
        6 * 60_000 +
        leftAtPause +
        (GAMES[gameId].deadline(room.state.game!.state)! - viewMatch(room.state, "p0", T0).game!.deadline!),
    );
  });

  test("only the host pauses and resumes, and only while a countdown runs", () => {
    const room = playing("survey-says");
    room.dispatch({ type: "pause", playerId: "p1", now: T0 });
    expect(room.state.pausedAt).toBeNull();
    room.dispatch({ type: "pause", playerId: "p0", now: T0 });
    room.dispatch({ type: "resume", playerId: "p1", now: T0 + 1000 });
    expect(room.state.pausedAt).toBe(T0);

    const lobby = createMatch("LOBB", 1);
    const step = reduceMatch(reduceMatch(lobby, { type: "join", player: players(1)[0]!, now: T0 }).state, {
      type: "pause",
      playerId: "p0",
      now: T0,
    });
    expect(step.state.pausedAt).toBeNull();
  });

  test("chat goes on while paused", () => {
    const room = playing("worst-feedback");
    room.dispatch({ type: "pause", playerId: "p0", now: T0 });
    room.dispatch({ type: "chat", playerId: "p1", text: "brb, doorbell", now: T0 + 1000 });
    expect(room.state.chat.at(-1)?.text).toBe("brb, doorbell");
  });

  test("a forgotten pause resumes by itself after 10 minutes", () => {
    const room = playing("bot-or-not");
    room.dispatch({ type: "pause", playerId: "p0", now: T0 });
    room.dispatch({ type: "tick", now: T0 + MAX_PAUSE_MS - 1 });
    expect(room.state.pausedAt).toBe(T0);
    room.dispatch({ type: "tick", now: T0 + MAX_PAUSE_MS });
    expect(room.state.pausedAt).toBeNull();
    expect(room.state.chat.at(-1)?.text).toMatch(/pause ran out/);
  });

  test("a new host can resume when the host who paused leaves", () => {
    const room = playing("skip-logic");
    room.dispatch({ type: "pause", playerId: "p0", now: T0 });
    room.dispatch({ type: "disconnect", playerId: "p0", now: T0 });
    room.dispatch({ type: "tick", now: T0 + 2 * 60_000 });
    expect(room.state.hostId).toBe("p1");
    room.dispatch({ type: "resume", playerId: "p1", now: T0 + 2 * 60_000 });
    expect(room.state.pausedAt).toBeNull();
  });

  test("the rules screen and the break between games pause too", () => {
    let state = createMatch("BRCK", 5);
    for (const p of players(3)) state = reduceMatch(state, { type: "join", player: p, now: T0 }).state;
    const step = reduceMatch(state, { type: "start", playerId: "p0", now: T0 });
    state = step.state;
    const load = step.effects.find((e) => e.kind === "load_content")!;
    if (load.kind !== "load_content") throw new Error("no content request");
    state = reduceMatch(state, {
      type: "effect_result",
      effectId: load.id,
      result: { index: 0, content: fixtures[load.request.gameId] },
      now: T0,
    }).state;
    expect(state.phase).toBe("intro");
    const ends = state.phaseEndsAt!;
    state = reduceMatch(state, { type: "pause", playerId: "p0", now: T0 + 1000 }).state;
    state = reduceMatch(state, { type: "tick", now: T0 + 60_000 }).state;
    expect(state.phase).toBe("intro");
    state = reduceMatch(state, { type: "resume", playerId: "p0", now: T0 + 60_000 }).state;
    expect(nextDeadline(state)).toBe(ends + 59_000);
  });
});
