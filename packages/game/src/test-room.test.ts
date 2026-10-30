import { describe, expect, test } from "vitest";
import { todoFor } from "./bots";
import { GAMES } from "./games";
import {
  TEST_BOTS,
  createTestMatch,
  nextDeadline,
  reduceMatch,
  viewMatch,
  type MatchEffect,
  type MatchEvent,
  type MatchState,
} from "./match";
import { fixtures, players } from "./test-helpers";
import type { HueClueState } from "./games/hue-clue";
import { ringDistance } from "./games/hue-grid";
import type { InOrderState } from "./games/in-order";
import type { MakeItWorseState } from "./games/make-it-worse";
import { PAINT_CELLS, type PaintGrabState } from "./games/paint-grab";
import { guessMatches, judgeChainsByKeywords } from "./text";
import { GAME_IDS, type GameId } from "./types";

const T0 = 1_000_000;
const person = players(1)[0]!;

/** A "Test it" room with its person, answering effects the way the room does with Claude off. */
function testRoom(gameId: GameId) {
  let state = createTestMatch("TEST", 7, gameId);
  let now = T0;
  const effects: MatchEffect[] = [];
  const dispatch = (event: MatchEvent) => {
    const step = reduceMatch(state, event);
    state = step.state;
    effects.push(...step.effects);
    for (const e of step.effects) {
      const answer = (result: unknown) => dispatch({ type: "effect_result", effectId: e.id, result, now });
      if (e.kind === "load_content") answer({ index: e.index, content: fixtures[e.request.gameId] });
      if (e.kind === "judge_guess") answer({ correct: guessMatches(e.input.realQuestion, e.input.guess) });
      if (e.kind === "judge_chains") answer(judgeChainsByKeywords(e.input));
    }
  };
  return {
    get state(): MatchState {
      return state;
    },
    get now() {
      return now;
    },
    effects,
    dispatch,
    join: () => dispatch({ type: "join", player: person, now }),
    tick() {
      now = Math.max(now, nextDeadline(state) ?? now);
      dispatch({ type: "tick", now });
    },
  };
}

describe("test rooms", () => {
  test("seat three bots, skip the lobby and make the person host", () => {
    const room = testRoom("worst-feedback");
    room.join();
    expect(room.state.members.map((m) => m.id)).toEqual([...TEST_BOTS.map((b) => b.id), person.id]);
    expect(room.state.hostId).toBe(person.id);
    expect(room.state.phase).toBe("intro");
    expect(room.state.playlist).toEqual(["worst-feedback"]);
    expect(room.state.introReady).toEqual(TEST_BOTS.map((b) => b.id));
    expect(viewMatch(room.state, person.id, T0)).toMatchObject({
      test: "worst-feedback",
      bots: TEST_BOTS.map((b) => b.id),
    });
  });

  test("bots move a few seconds after a move is needed, long before the deadline", () => {
    const room = testRoom("worst-feedback");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    expect(room.state.phase).toBe("playing");
    const phaseEnds = GAMES["worst-feedback"].deadline(room.state.game!.state)!;
    while (TEST_BOTS.some((b) => todoFor(viewMatch(room.state, b.id, room.now), b.id))) room.tick();
    expect(room.now).toBeLessThan(phaseEnds - 30_000);
    expect(todoFor(viewMatch(room.state, person.id, room.now), person.id)).not.toBeNull();
  });

  test.each(GAME_IDS)("%s plays to the report with the bots, and the test isn't saved", (gameId) => {
    const room = testRoom(gameId);
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    // Paint Grab's bots paint a few times a second, so it takes many more ticks.
    for (let i = 0; i < 3000 && room.state.phase !== "report"; i++) room.tick();
    expect(room.state.phase).toBe("report");
    expect(room.state.history.map((h) => h.gameId)).toEqual([gameId]);
    expect(room.effects.some((e) => e.kind === "save_match")).toBe(false);
  });

  test("play again goes straight back into the game", () => {
    const room = testRoom("survey-says");
    room.join();
    room.dispatch({ type: "end", playerId: person.id, now: room.now });
    expect(room.state.phase).toBe("report");
    room.dispatch({ type: "again", playerId: person.id, now: room.now });
    expect(room.state.phase).toBe("intro");
  });

  test("bots stop once the person has left, and never become host", () => {
    const room = testRoom("bot-or-not");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    room.dispatch({ type: "disconnect", playerId: person.id, now: room.now });
    for (let i = 0; i < 50 && room.state.members.some((m) => m.id === person.id && m.status !== "left"); i++)
      room.tick();
    expect(room.state.hostId).toBeNull();
    // Nothing is left due in the past, which would wake the room over and over.
    room.tick();
    const next = nextDeadline(room.state);
    expect(next === null || next > room.now).toBe(true);
  });

  test("bots take every turn in turn-based games", () => {
    const room = testRoom("fake-artist");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    const game = () =>
      room.state.game!.state as {
        phase: string;
        turnIndex: number;
        rounds: { turns: string[]; lines: unknown[] }[];
      };
    for (let i = 0; i < 100 && game().phase === "draw"; i++) {
      const drawer = game().rounds[0]!.turns[game().turnIndex]!;
      if (drawer === person.id) {
        room.dispatch({
          type: "action",
          playerId: person.id,
          action: { type: "line", points: [1, 1, 50, 50] },
          now: room.now,
        });
      } else room.tick();
    }
    expect(game().rounds[0]!.lines).toHaveLength(game().rounds[0]!.turns.length);
  });

  test("In Order bots play each of their cards at its own moment, mostly in order", () => {
    const room = testRoom("in-order");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    const game = () => room.state.game?.state as InOrderState | undefined;
    const seen: { level: number; playerId: string; card: number; at: number; burned: number }[] = [];
    for (let i = 0; i < 500 && room.state.phase !== "report"; i++) {
      const s = game();
      // The person plays perfectly: their lowest card as soon as it's the lowest one left.
      const mine = s?.hands[person.id]?.[0];
      const lowest = s ? Math.min(...Object.values(s.hands).flat()) : 0;
      if (s?.phase === "play" && mine !== undefined && mine === lowest) {
        room.dispatch({ type: "action", playerId: person.id, action: { type: "play", card: mine }, now: room.now });
      } else room.tick();
      const after = game();
      for (const p of after?.plays.slice(seen.filter((x) => x.level === after.level).length) ?? [])
        seen.push({ level: after!.level, playerId: p.playerId, card: p.card, at: room.now, burned: p.burned.length });
    }
    expect(room.state.phase).toBe("report");
    const bots = seen.filter((p) => p.playerId !== person.id);
    // Every level was reached, and bots played more than one card in a level.
    expect(new Set(seen.map((p) => p.level))).toEqual(new Set([0, 1, 2]));
    expect(bots.some((p) => bots.filter((q) => q.level === p.level && q.playerId === p.playerId).length > 1)).toBe(true);
    // Bots' plays are spread out in time, not fired at once.
    const level2 = bots.filter((p) => p.level === 2);
    expect(new Set(level2.map((p) => p.at)).size).toBe(level2.length);
    expect(seen.filter((p) => p.burned).length).toBeLessThanOrEqual(2);
  });

  test("Paint Grab bots keep painting all round, a few batches a second, and grab a real share", () => {
    const room = testRoom("paint-grab");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    const game = () => room.state.game?.state as PaintGrabState | undefined;
    let paintStart = 0;
    while (game()?.phase !== "paint") room.tick();
    paintStart = room.now;
    let last = { ...game()!.pens };
    let longestGap = 0;
    let lastAt = room.now;
    while (game()?.phase === "paint") {
      room.tick();
      const pens = game()?.pens ?? {};
      if (TEST_BOTS.some((b) => (pens[b.id]?.strokes ?? 0) !== (last[b.id]?.strokes ?? 0))) {
        longestGap = Math.max(longestGap, room.now - lastAt);
        lastAt = room.now;
      }
      last = { ...pens };
    }
    expect(game()?.phase).toBe("reveal");
    const seconds = (room.now - paintStart) / 1000;
    const result = game()!.rounds[0]!;
    for (const bot of TEST_BOTS) {
      // About three batches a second, the whole round through.
      const rate = last[bot.id]!.strokes / seconds;
      expect(rate).toBeGreaterThan(2);
      expect(rate).toBeLessThan(4);
      // Each bot owns a real part of the canvas at the end.
      expect(result.counts[bot.id]).toBeGreaterThan(PAINT_CELLS * 0.05);
    }
    expect(longestGap).toBeLessThan(1000);
    // Their loops filled in, and the person, who never painted, has nothing.
    expect(TEST_BOTS.some((b) => (game()!.stats[b.id]?.loopCells ?? 0) > 50)).toBe(true);
    expect(result.counts[person.id]).toBe(0);
    // The plan only keeps each bot's current stroke, not one entry per stroke made.
    expect(Object.keys(room.state.botPlan ?? {}).length).toBeLessThanOrEqual(TEST_BOTS.length * 2);
  });

  test("Hue Clue bots give their own clues and guess near each other's colours", () => {
    const room = testRoom("hue-clue");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    const game = () => room.state.game?.state as HueClueState | undefined;
    let last: HueClueState | undefined;
    for (let i = 0; i < 500 && room.state.phase !== "report"; i++) {
      last = game() ?? last;
      room.tick();
    }
    expect(room.state.phase).toBe("report");
    const rounds = last!.rounds;
    // Four players: everyone gives two clues.
    expect(rounds).toHaveLength(8);
    const botRounds = rounds.filter((r) => r.giverId !== person.id);
    expect(botRounds.every((r) => r.clue && !r.autoClue)).toBe(true);
    // The person never moved: their rounds got a house clue, and they never put a pin down.
    expect(rounds.filter((r) => r.giverId === person.id).every((r) => r.autoClue)).toBe(true);
    expect(rounds.every((r) => !r.pins[person.id])).toBe(true);
    const pins = botRounds.flatMap((r) => Object.values(r.pins).map((p) => ringDistance(p.cell, r.target)));
    expect(pins).toHaveLength(botRounds.length * 2);
    expect(pins.filter((d) => d <= 1).length / pins.length).toBeGreaterThan(0.6);
  });

  test("Make It Worse bots build their own forms, then fill in each form step by step", () => {
    const room = testRoom("make-it-worse");
    room.join();
    room.dispatch({ type: "ready", playerId: person.id, now: room.now });
    const game = () => room.state.game?.state as MakeItWorseState | undefined;
    // The person builds a form, then sits each form out.
    room.dispatch({ type: "action", playerId: person.id, action: { type: "form", traps: [{ trap: "modals" }], lock: true }, now: room.now });
    const progress = new Map<string, number[]>();
    let results = 0;
    let built: MakeItWorseState | undefined;
    for (let i = 0; i < 2000 && room.state.phase !== "report"; i++) {
      room.tick();
      if (!built && game()?.phase === "ready") built = game();
      const run = game()?.run;
      for (const [id, p] of Object.entries(run?.progress ?? {})) {
        const seen = progress.get(`${game()!.round}|${id}`) ?? [];
        if (seen.at(-1) !== p.done) progress.set(`${game()!.round}|${id}`, [...seen, p.done]);
      }
      if (run?.result && game()?.phase === "reveal" && progress.get(`result|${game()!.round}`) === undefined) {
        progress.set(`result|${game()!.round}`, []);
        results++;
        // Every bot got to Submit; only the person, sitting it out, didn't.
        const bots = run.result.players.filter((p) => p.playerId !== person.id);
        expect(bots.every((p) => p.finished)).toBe(true);
      }
    }
    expect(room.state.phase).toBe("report");
    expect(results).toBe(4);
    // The bots built their forms themselves, before time ran out.
    expect(TEST_BOTS.every((b) => built?.forms[b.id]?.auto === false && built.forms[b.id]!.traps.length > 0)).toBe(true);
    // Bots pass the checkpoints one at a time, not all at once.
    expect([...progress.values()].some((steps) => steps.length >= 3)).toBe(true);
  });
});
