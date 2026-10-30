import {
  createMatch,
  createRng,
  randomSmashFighter,
  reduceMatch,
  type DoodleSmashState,
  type MatchEvent,
  type MatchState,
  type PlayerInfo,
} from "@brick/game";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  BROADCAST_INTERVAL_MS,
  LIVE_BROADCAST_INTERVAL_MS,
  LiveTicker,
  broadcastInterval,
  liveRate,
} from "./live";

const players: PlayerInfo[] = ["p0", "p1", "p2"].map((id) => ({
  id,
  name: id,
  avatar: { color: "teal", hat: "none", face: "classic", shape: "brick" },
}));

/**
 * The parts of GameRoom that drive a live game, on a fake clock: every event goes through the match, then the room
 * syncs its ticker and update rate to it, as `GameRoom.dispatch` and `syncLive` do.
 */
function room() {
  let match: MatchState = createMatch("LIVE", 3);
  let here = true;
  let ticks = 0;
  const ticker = new LiveTicker(() => {
    ticks += 1;
    dispatch({ type: "tick", now: Date.now() });
  });
  const sync = () => ticker.set(liveRate(match, here));
  const dispatch = (event: MatchEvent) => {
    const step = reduceMatch(match, event);
    match = step.state;
    for (const e of step.effects) {
      if (e.kind === "load_content")
        dispatch({
          type: "effect_result",
          effectId: e.id,
          result: { index: e.index, content: {} },
          now: event.now,
        });
    }
    sync();
  };
  return {
    get match() {
      return match;
    },
    get game() {
      return match.game?.state as DoodleSmashState | undefined;
    },
    get ticks() {
      return ticks;
    },
    ticker,
    dispatch,
    /** Everyone's sockets close, or one comes back. */
    setHere(value: boolean) {
      here = value;
      sync();
    },
  };
}

/** Plays a room of three up to Doodle Smash's fight. */
function toFight() {
  const r = room();
  const now = () => Date.now();
  for (const p of players) r.dispatch({ type: "join", player: p, now: now() });
  r.dispatch({
    type: "settings",
    playerId: "p0",
    settings: { preset: "custom", custom: ["doodle-smash"], spice: "mild" },
    now: now(),
  });
  r.dispatch({ type: "start", playerId: "p0", now: now() });
  r.dispatch({ type: "next", playerId: "p0", now: now() });
  expect(r.ticker.rate).toBeNull();
  const rng = createRng(4);
  for (const p of players)
    r.dispatch({
      type: "action",
      playerId: p.id,
      action: { type: "fighter", ...randomSmashFighter(rng.next) },
      now: now(),
    });
  expect(r.game?.phase).toBe("weighin");
  expect(r.ticker.rate).toBeNull();
  vi.setSystemTime(r.game!.phaseEndsAt);
  r.dispatch({ type: "tick", now: now() });
  expect(r.game?.phase).toBe("fight");
  return r;
}

describe("the room's live ticks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("start with the fight, step it by the clock, and go out faster", () => {
    const r = toFight();
    expect(r.ticker.rate).toBe(50);
    expect(broadcastInterval(r.ticker.rate)).toBe(LIVE_BROADCAST_INTERVAL_MS);
    vi.advanceTimersByTime(1000);
    expect(r.ticks).toBe(20);
    expect(r.game!.fight!.tick).toBe(20);
  });

  test("stop while paused and start again on resume, without racing through the pause", () => {
    const r = toFight();
    vi.advanceTimersByTime(500);
    r.dispatch({ type: "pause", playerId: "p0", now: Date.now() });
    expect(r.ticker.rate).toBeNull();
    const ticks = r.ticks;
    vi.advanceTimersByTime(30_000);
    expect(r.ticks).toBe(ticks);
    r.dispatch({ type: "resume", playerId: "p0", now: Date.now() });
    expect(r.ticker.rate).toBe(50);
    vi.advanceTimersByTime(500);
    expect(r.game!.fight!.tick).toBe(20);
  });

  test("stop when nobody is connected, and pick up again when someone is back", () => {
    const r = toFight();
    vi.advanceTimersByTime(200);
    r.setHere(false);
    expect(r.ticker.rate).toBeNull();
    const ticks = r.ticks;
    vi.advanceTimersByTime(5_000);
    expect(r.ticks).toBe(ticks);
    r.setHere(true);
    vi.advanceTimersByTime(100);
    expect(r.ticks).toBe(ticks + 2);
  });

  test("stop when the fight is over", () => {
    const r = toFight();
    vi.setSystemTime(r.game!.phaseEndsAt);
    r.dispatch({ type: "tick", now: Date.now() });
    expect(r.game!.phase).toBe("results");
    expect(r.ticker.rate).toBeNull();
    expect(broadcastInterval(r.ticker.rate)).toBe(BROADCAST_INTERVAL_MS);
    const ticks = r.ticks;
    vi.advanceTimersByTime(2_000);
    expect(r.ticks).toBe(ticks);
  });
});
