import { describe, expect, test } from "vitest";
import { GAMES } from "./games";
import {
  CHAT_HISTORY,
  ENDLESS_MAX_GAMES,
  ENDLESS_ROTATION,
  MAX_MEMBERS,
  PRESET_GAMES,
  createMatch,
  createTestMatch,
  extendMs,
  nextDeadline,
  reduceMatch,
  resolvePlaylist,
  roomSummary,
  shuffleLineup,
  viewMatch,
  type MatchEffect,
  type MatchEvent,
  type MatchState,
} from "./match";
import { fixtures, players } from "./test-helpers";
import { avatarSchema } from "./types";

const T0 = 1_000_000;

/** Runs events through the match and answers its async effects the way the room would. */
function harness(n: number) {
  let state = createMatch("BRCK", 99);
  let now = T0;
  const effects: MatchEffect[] = [];
  const dispatch = (event: MatchEvent) => {
    const step = reduceMatch(state, event);
    state = step.state;
    effects.push(...step.effects);
    for (const e of step.effects) {
      if (e.kind === "load_content") {
        dispatch({
          type: "effect_result",
          effectId: e.id,
          result: { index: e.index, content: fixtures[e.request.gameId] },
          now,
        });
      }
    }
  };
  for (const p of players(n)) dispatch({ type: "join", player: p, now });
  return {
    get state(): MatchState {
      return state;
    },
    effects,
    dispatch,
    tickToDeadline() {
      now = nextDeadline(state) ?? now;
      dispatch({ type: "tick", now });
    },
  };
}

describe("match", () => {
  test("first joiner hosts; only the host can change settings and start", () => {
    const h = harness(3);
    expect(h.state.hostId).toBe("p0");
    h.dispatch({ type: "start", playerId: "p1", now: T0 });
    expect(h.state.phase).toBe("lobby");
    h.dispatch({ type: "settings", playerId: "p0", settings: { preset: "full", custom: [], spice: "spicy" }, now: T0 });
    expect(h.state.settings.spice).toBe("spicy");
  });

  test("needs three players to start", () => {
    const h = harness(2);
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    expect(h.state.phase).toBe("lobby");
    expect(h.state.chat.at(-1)!.text).toMatch(/at least 3/);
  });

  test("plays the quick playlist end to end on timers and produces a report", () => {
    const h = harness(4);
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    expect(h.effects.filter((e) => e.kind === "load_content").map((e) => e.kind === "load_content" && e.index)).toEqual([0, 1]);
    expect(h.state.phase).toBe("intro");
    expect(h.state.game).toBeNull();
    for (const p of players(4)) h.dispatch({ type: "ready", playerId: p.id, now: T0 });
    expect(h.state.phase).toBe("playing");
    expect(h.state.game!.gameId).toBe("worst-feedback");

    const seen = new Set<string>();
    for (let i = 0; i < 500 && h.state.phase !== "report"; i++) {
      if (h.state.game) seen.add(h.state.game.gameId);
      h.tickToDeadline();
    }
    expect(h.state.phase).toBe("report");
    expect([...seen]).toEqual(["worst-feedback", "bot-or-not", "survey-says"]);
    expect(h.state.history).toHaveLength(3);
    const report = h.state.report!;
    expect(report.players).toHaveLength(4);
    expect(report.awards.some((a) => a.id === "nps-100")).toBe(true);
    expect(h.effects.some((e) => e.kind === "save_match")).toBe(true);

    h.dispatch({ type: "effect_result", effectId: h.effects.find((e) => e.kind === "save_match")!.id, result: { matchId: "m1" }, now: T0 });
    expect(viewMatch(h.state, "p1", T0).matchId).toBe("m1");

    h.dispatch({ type: "again", playerId: "p0", now: T0 });
    expect(h.state.phase).toBe("lobby");
    expect(h.state.totals).toEqual({});
  });

  test("routes game actions with validation and gives spectators no player secrets", () => {
    const h = harness(3);
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    h.dispatch({ type: "next", playerId: "p0", now: T0 });
    h.dispatch({ type: "join", player: { id: "late", name: "Late", avatar: { color: "sun", hat: "cap", face: "glasses", shape: "round" } }, now: T0 });
    const late = viewMatch(h.state, "late", T0);
    expect(late.game!.players).not.toContain("late");
    expect((late.game!.view as { hand: unknown }).hand).toBeNull();

    h.dispatch({ type: "action", playerId: "p0", action: { type: "write", text: "" }, now: T0 });
    h.dispatch({ type: "action", playerId: "late", action: { type: "write", text: "sneaky" }, now: T0 });
    h.dispatch({ type: "action", playerId: "p1", action: { type: "write", text: "hello" }, now: T0 });
    const answers = (h.state.game!.state as { answers: Record<string, unknown> }).answers;
    expect(Object.keys(answers)).toEqual(["p1"]);
  });

  test("each game opens with its rules until everyone is ready, the host skips, or time runs out", () => {
    const h = harness(3);
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    expect(h.state.phase).toBe("intro");
    expect(viewMatch(h.state, "p1", T0).phaseEndsAt).toBeGreaterThan(T0);

    h.dispatch({ type: "ready", playerId: "p1", now: T0 });
    h.dispatch({ type: "ready", playerId: "p1", now: T0 });
    h.dispatch({ type: "ready", playerId: "p2", now: T0 });
    expect(viewMatch(h.state, "p0", T0).introReady).toEqual(["p1", "p2"]);
    h.dispatch({ type: "next", playerId: "p1", now: T0 });
    expect(h.state.phase).toBe("intro");

    // A disconnected player doesn't hold everyone up.
    h.dispatch({ type: "disconnect", playerId: "p0", now: T0 });
    h.dispatch({ type: "ready", playerId: "p2", now: T0 });
    expect(h.state.phase).toBe("intro");
    h.tickToDeadline();
    expect(h.state.phase).toBe("playing");
    // The game's own clock starts when the rules screen ends.
    const game = h.state.game!.state as { phaseEndsAt: number };
    expect(game.phaseEndsAt).toBeGreaterThan(T0 + 20_000);
  });

  test("away players keep their seat for a while, then leave and hand over host", () => {
    const h = harness(3);
    h.dispatch({ type: "disconnect", playerId: "p0", now: T0 });
    expect(h.state.members[0]!.status).toBe("away");
    h.dispatch({ type: "join", player: players(1)[0]!, now: T0 + 1000 });
    expect(h.state.members[0]!.status).toBe("online");

    h.dispatch({ type: "disconnect", playerId: "p0", now: T0 + 2000 });
    h.tickToDeadline();
    expect(h.state.members.map((m) => m.id)).toEqual(["p1", "p2"]);
    expect(h.state.hostId).toBe("p1");
  });

  test("a room stays on the open-rooms list while anyone holds a seat, away included", () => {
    const h = harness(2);
    expect(roomSummary(h.state)).toEqual({ code: "BRCK", players: 2, away: 0, phase: "lobby", gameId: null });
    h.dispatch({ type: "disconnect", playerId: "p0", now: T0 });
    h.dispatch({ type: "disconnect", playerId: "p1", now: T0 });
    expect(roomSummary(h.state)).toMatchObject({ players: 2, away: 2 });
    h.tickToDeadline();
    expect(roomSummary(h.state)).toBeNull();
  });

  test("test rooms never go on the open-rooms list", () => {
    expect(roomSummary(createTestMatch("TEST", 1, "worst-feedback"))).toBeNull();
  });

  test("the host adds the current screen's usual length to its timer, and nobody else can", () => {
    const h = harness(3);
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    while (h.state.phase === "loading") h.tickToDeadline();
    expect(h.state.phase).toBe("intro");
    const introEnds = h.state.phaseEndsAt!;
    const intro = extendMs(h.state)!;
    h.dispatch({ type: "extend", playerId: "p1", now: T0 });
    expect(h.state.phaseEndsAt).toBe(introEnds);
    h.dispatch({ type: "extend", playerId: "p0", now: T0 });
    expect(h.state.phaseEndsAt).toBe(introEnds + intro);

    h.dispatch({ type: "next", playerId: "p0", now: T0 });
    expect(h.state.phase).toBe("playing");
    const game = h.state.game!.state as { phaseEndsAt: number; phaseMs: number };
    const ends = game.phaseEndsAt;
    expect(viewMatch(h.state, "p0", T0).extendMs).toBe(game.phaseMs);
    h.dispatch({ type: "extend", playerId: "p0", now: T0 });
    expect((h.state.game!.state as { phaseEndsAt: number }).phaseEndsAt).toBe(ends + game.phaseMs);
    expect(h.state.chat.at(-1)!.text).toMatch(/added \d+ seconds/);
  });

  test("host can kick, and kicked players can't come back", () => {
    const h = harness(3);
    h.dispatch({ type: "kick", playerId: "p0", targetId: "p2", now: T0 });
    expect(h.effects.at(-1)).toMatchObject({ kind: "kick", playerId: "p2" });
    h.dispatch({ type: "join", player: players(3)[2]!, now: T0 });
    expect(h.state.members.map((m) => m.id)).toEqual(["p0", "p1"]);
  });

  test("endless mode keeps rotating until the host ends it", () => {
    const h = harness(3);
    h.dispatch({ type: "settings", playerId: "p0", settings: { preset: "endless", custom: [], spice: "mild" }, now: T0 });
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    for (let i = 0; i < 2000 && h.state.history.length < 12; i++) h.tickToDeadline();
    expect(h.state.history.map((r) => r.gameId)).toEqual([
      "worst-feedback",
      "bot-or-not",
      "survey-says",
      "skip-logic",
      "fake-artist",
      "brick-brawl",
      "in-order",
      "doodle-champions",
      "paint-grab",
      "hue-clue",
      "doodle-smash",
      "make-it-worse",
    ]);
    h.dispatch({ type: "end", playerId: "p0", now: T0 });
    expect(h.state.phase).toBe("report");
  });

  test("endless mode ends with the report after its last game", () => {
    const h = harness(3);
    h.dispatch({ type: "settings", playerId: "p0", settings: { preset: "endless", custom: [], spice: "mild" }, now: T0 });
    h.dispatch({ type: "start", playerId: "p0", now: T0 });
    for (let i = 0; i < 40_000 && h.state.phase !== "report"; i++) h.tickToDeadline();
    expect(h.state.phase).toBe("report");
    expect(h.state.history).toHaveLength(ENDLESS_MAX_GAMES);
    expect(h.effects.some((e) => e.kind === "load_content" && e.index >= ENDLESS_MAX_GAMES)).toBe(false);
  });

  test("a full room turns new players away but lets members back in", () => {
    const h = harness(MAX_MEMBERS);
    const extra = { ...players(1)[0]!, id: "late", name: "Late Larry" };
    h.dispatch({ type: "join", player: extra, now: T0 });
    expect(h.effects.at(-1)).toMatchObject({ kind: "full", playerId: "late" });
    expect(h.state.members).toHaveLength(MAX_MEMBERS);
    h.dispatch({ type: "join", player: players(1)[0]!, now: T0 });
    expect(h.effects.filter((e) => e.kind === "full")).toHaveLength(1);
  });

  test("chat keeps only the latest messages", () => {
    const h = harness(3);
    for (let i = 0; i < CHAT_HISTORY + 20; i++) h.dispatch({ type: "chat", playerId: "p1", text: `msg ${i}`, now: T0 + i });
    expect(h.state.chat).toHaveLength(CHAT_HISTORY);
    expect(h.state.chat.at(-1)!.text).toBe(`msg ${CHAT_HISTORY + 19}`);
  });

  test("every game's content fixture satisfies its schema", () => {
    for (const [id, def] of Object.entries(GAMES)) {
      expect(def.contentSchema.safeParse(fixtures[id as keyof typeof fixtures]).success, id).toBe(true);
    }
  });
});

test("avatars saved before faces and shapes get the original look", () => {
  expect(avatarSchema.parse({ color: "sun", hat: "cap" })).toEqual({ color: "sun", hat: "cap", face: "classic", shape: "brick" });
  expect(avatarSchema.safeParse({ color: "sun", hat: "cap", face: "monocle" }).success).toBe(false);
});

describe("shuffled lineups", () => {
  test.each(["quick", "full"] as const)("a shuffled %s lineup is different games adding up to about its length", (preset) => {
    const target = preset === "quick" ? 30 : 60;
    for (let seed = 1; seed < 40; seed++) {
      let x = seed;
      const random = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const lineup = shuffleLineup(preset, random);
      const minutes = lineup.reduce((sum, id) => sum + GAMES[id].minutes, 0);
      expect(new Set(lineup).size).toBe(lineup.length);
      expect(minutes).toBeGreaterThanOrEqual(target - 8);
      expect(minutes).toBeLessThanOrEqual(target + 3);
    }
  });

  test("the match plays the shuffled lineup instead of the preset's games", () => {
    expect(resolvePlaylist({ preset: "quick", custom: [], spice: "mild", lineup: ["hue-clue", "in-order"] })).toEqual(["hue-clue", "in-order"]);
    expect(resolvePlaylist({ preset: "quick", custom: [], spice: "mild" })).toEqual(PRESET_GAMES.quick);
    expect(resolvePlaylist({ preset: "endless", custom: [], spice: "mild", lineup: ["hue-clue"] })).toEqual(ENDLESS_ROTATION);
  });
});
