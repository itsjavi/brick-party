import { describe, expect, test } from "vitest";
import { GRACE_MS } from "../engine";
import { createRng } from "../rng";
import { fixtures, players } from "../test-helpers";
import { GAME_CATEGORIES, GAME_IDS } from "../types";
import { GAMES } from "./index";
import { POINTS, botOrNot, type BotOrNotState } from "./bot-or-not";
import { NAILED_IT, CLOSE_ENOUGH, skipLogic, type SkipLogicState } from "./skip-logic";
import { MAX_PREDICTION_POINTS, surveySays, type SurveySaysState } from "./survey-says";
import { WORST_FEEDBACK_SWAPS, worstFeedback, type WorstFeedbackState } from "./worst-feedback";

const T0 = 1_000_000;

describe("rng", () => {
  test("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.int(10), a.shuffle([1, 2, 3, 4])]).toEqual([b.next(), b.int(10), b.shuffle([1, 2, 3, 4])]);
  });
});

describe("Worst Feedback Ever", () => {
  const ps = players(4);
  const init = () =>
    worstFeedback.init({ players: ps, content: fixtures["worst-feedback"], spice: "mild", seed: 7, now: T0, pace: 1 }).state;
  const act = (s: WorstFeedbackState, playerId: string, action: unknown, now = T0) =>
    worstFeedback.reduce(s, { type: "action", playerId, action, now }).state;

  test("deals hands and never shows other players' hands", () => {
    const s = init();
    expect(Object.values(s.hands).every((h) => h.length === 6)).toBe(true);
    const view = worstFeedback.view(s, "p0");
    expect(view.hand).toEqual(s.hands.p0!.map((c) => ({ ...c, fresh: false })));
    expect(view.swapsLeft).toBe(WORST_FEEDBACK_SWAPS);
    expect(JSON.stringify(view)).not.toContain(s.hands.p1![0]!.text);
    expect(worstFeedback.view(s, null).hand).toBeNull();
  });

  test("plays a full game: answers, anonymous ballot, votes, unanimous bonus", () => {
    let s = init();
    for (let round = 0; round < 3; round++) {
      s = act(s, "p0", { type: "write", text: `p0 wrote ${round}` });
      for (const id of ["p1", "p2", "p3"]) s = act(s, id, { type: "play", cardId: s.hands[id]![0]!.id });
      expect(s.phase).toBe("vote");

      const ballot = worstFeedback.view(s, "p1").ballot!;
      expect(ballot).toHaveLength(4);
      expect(JSON.stringify(ballot)).not.toMatch(/"p\d"/);
      const p0Answer = s.answers.p0!.answerId;
      expect(worstFeedback.view(s, "p0").ballot!.find((b) => b.answerId === p0Answer)?.mine).toBe(true);

      // Can't vote for yourself.
      s = act(s, "p0", { type: "vote", answerId: p0Answer });
      expect(s.votes.p0).toBeUndefined();
      for (const id of ["p1", "p2", "p3"]) s = act(s, id, { type: "vote", answerId: p0Answer });
      s = act(s, "p0", { type: "vote", answerId: s.answers.p1!.answerId });
      expect(s.phase).toBe("results");
      expect(s.results![0]).toMatchObject({ authorId: "p0", unanimous: true, points: 500 });
      s = worstFeedback.reduce(s, { type: "tick", now: s.phaseEndsAt }).state;
    }
    expect(worstFeedback.isOver(s)).toBe(true);
    expect(worstFeedback.scores(s)).toMatchObject({ p0: 1500, p1: 300, p2: 0, p3: 0 });
    expect(worstFeedback.stats(s).p0).toMatchObject({ promoterVotes: 9, unanimous: 3, writeIns: 3 });
  });

  test("auto-plays a card for players who time out", () => {
    let s = init();
    s = act(s, "p0", { type: "write", text: "only me" });
    s = worstFeedback.reduce(s, { type: "tick", now: s.phaseEndsAt + GRACE_MS }).state;
    expect(s.phase).toBe("vote");
    expect(Object.values(s.answers).filter((a) => a.auto)).toHaveLength(3);
    expect(s.hands.p1).toHaveLength(6);
  });

  test("swaps a card in place, up to the limit per game, without answering", () => {
    let s = init();
    const before = s.hands.p0!.map((c) => c.id);
    s = act(s, "p0", { type: "swap", cardId: before[2]! });
    const after = s.hands.p0!.map((c) => c.id);
    expect(after).toHaveLength(6);
    expect(after[2]).not.toBe(before[2]);
    expect(after.filter((id, i) => i !== 2)).toEqual(before.filter((id, i) => i !== 2));
    expect(s.answers.p0).toBeUndefined();
    const view = worstFeedback.view(s, "p0");
    expect(view.swapsLeft).toBe(WORST_FEEDBACK_SWAPS - 1);
    expect(view.hand!.filter((c) => c.fresh).map((c) => c.id)).toEqual([after[2]]);

    // A card that isn't in your hand, or someone else's swaps, change nothing.
    expect(act(s, "p0", { type: "swap", cardId: s.hands.p1![0]!.id }).hands.p0).toEqual(s.hands.p0);

    // The second swap happens next round: the limit is per game, and the marker is gone.
    for (const id of ["p0", "p1", "p2", "p3"]) s = act(s, id, { type: "play", cardId: s.hands[id]![0]!.id });
    s = worstFeedback.reduce(s, { type: "skip", now: T0 }).state;
    s = worstFeedback.reduce(s, { type: "skip", now: T0 }).state;
    expect(s.phase).toBe("answer");
    expect(worstFeedback.view(s, "p0").hand!.find((c) => c.id === after[2])?.fresh).toBe(false);
    s = act(s, "p0", { type: "swap", cardId: s.hands.p0![0]!.id });
    const spent = act(s, "p0", { type: "swap", cardId: s.hands.p0![1]!.id });
    expect(spent.hands.p0).toEqual(s.hands.p0);
    expect(worstFeedback.view(spent, "p0").swapsLeft).toBe(0);
  });

  test("no swaps after answering or outside the answer phase", () => {
    let s = init();
    s = act(s, "p0", { type: "write", text: "mine" });
    expect(act(s, "p0", { type: "swap", cardId: s.hands.p0![0]!.id }).hands.p0).toEqual(s.hands.p0);
    for (const id of ["p1", "p2", "p3"]) s = act(s, id, { type: "play", cardId: s.hands[id]![0]!.id });
    expect(s.phase).toBe("vote");
    expect(act(s, "p1", { type: "swap", cardId: s.hands.p1![0]!.id }).swapsLeft.p1).toBe(WORST_FEEDBACK_SWAPS);
  });

  test("marks the card that replaced a played one as new in the next round only", () => {
    let s = init();
    for (const id of ["p0", "p1", "p2", "p3"]) s = act(s, id, { type: "play", cardId: s.hands[id]![0]!.id });
    const replacement = s.hands.p0!.at(-1)!.id;
    s = worstFeedback.reduce(s, { type: "skip", now: T0 }).state;
    s = worstFeedback.reduce(s, { type: "skip", now: T0 }).state;
    expect(s.round).toBe(1);
    const fresh = () => worstFeedback.view(s, "p0").hand!.filter((c) => c.fresh).map((c) => c.id);
    expect(fresh()).toEqual([replacement]);
    for (const id of ["p0", "p1", "p2", "p3"]) s = act(s, id, { type: "play", cardId: s.hands[id]![1]!.id });
    s = worstFeedback.reduce(s, { type: "skip", now: T0 }).state;
    s = worstFeedback.reduce(s, { type: "skip", now: T0 }).state;
    expect(s.round).toBe(2);
    expect(fresh()).not.toContain(replacement);
    expect(fresh()).toHaveLength(1);
  });

  test("a player leaving doesn't block the round", () => {
    let s = init();
    for (const id of ["p0", "p1", "p2"]) s = act(s, id, { type: "play", cardId: s.hands[id]![0]!.id });
    expect(s.phase).toBe("answer");
    s = worstFeedback.reduce(s, { type: "player_left", playerId: "p3", now: T0 }).state;
    expect(s.phase).toBe("vote");
  });
});

describe("Bot or Not", () => {
  const ps = players(4);
  const init = () =>
    botOrNot.init({ players: ps, content: fixtures["bot-or-not"], spice: "mild", seed: 3, now: T0, pace: 1 }).state;
  const act = (s: BotOrNotState, playerId: string, action: unknown, now = T0) =>
    botOrNot.reduce(s, { type: "action", playerId, action, now });

  const answerAll = (s: BotOrNotState) => {
    for (const p of ps) s = act(s, p.id, { type: "answer", text: `answer from ${p.id}` }).state;
    return s;
  };
  const readyAll = (s: BotOrNotState) => {
    for (const p of ps) s = act(s, p.id, { type: "ready" }).state;
    return s;
  };

  test("gives 90 seconds to write an answer", () => {
    const s = init();
    expect(s.phase).toBe("answer");
    expect(s.phaseEndsAt - T0).toBe(90_000);
  });

  test("keeps the secret: the Bot never sees the real question, humans never see the bot's", () => {
    let s = init();
    const round = s.rounds[0]!;
    const human = ps.find((p) => p.id !== round.botId)!.id;
    for (const phase of ["answer", "discuss", "vote"] as const) {
      expect(s.phase).toBe(phase);
      const botView = JSON.stringify(botOrNot.view(s, round.botId));
      const humanView = JSON.stringify(botOrNot.view(s, human));
      expect(botView).not.toContain(round.pair.real);
      expect(botView).toContain(round.pair.bot);
      expect(humanView).not.toContain(round.pair.bot);
      expect(botOrNot.view(s, human).botId).toBeNull();
      expect(botOrNot.view(s, human).youAreBot).toBe(false);
      expect(botOrNot.view(s, round.botId).youAreBot).toBe(true);
      s = phase === "answer" ? answerAll(s) : phase === "discuss" ? readyAll(s) : s;
    }
    expect(botOrNot.view(s, human).answers).toHaveLength(4);
  });

  test("caught bot guesses, the judge effect decides, everyone is scored", () => {
    let s = readyAll(answerAll(init()));
    const { botId } = s.rounds[0]!;
    const humans = ps.filter((p) => p.id !== botId).map((p) => p.id);
    for (const id of humans) s = act(s, id, { type: "vote", targetId: botId }).state;
    s = act(s, botId, { type: "vote", targetId: humans[0]! }).state;
    expect(s.phase).toBe("guess");
    expect(botOrNot.view(s, humans[0]!).botId).toBe(botId);
    expect(JSON.stringify(botOrNot.view(s, botId))).not.toContain(s.rounds[0]!.pair.real);

    const step = act(s, botId, { type: "guess", text: "what to bring to a desert island" });
    expect(step.state.phase).toBe("judging");
    expect(step.effects).toEqual([
      { id: "bn-r0-judge", kind: "judge_guess", input: expect.objectContaining({ guess: "what to bring to a desert island" }) },
    ]);
    s = botOrNot.reduce(step.state, { type: "effect_result", effectId: "bn-r0-judge", result: { correct: true }, now: T0 }).state;
    expect(s.phase).toBe("results");
    expect(s.points[botId]).toBe(POINTS.botGuess);
    for (const id of humans) expect(s.points[id]).toBe(POINTS.correctVote);
  });

  test("an escaped bot scores and the most-voted human is framed", () => {
    let s = readyAll(answerAll(init()));
    const { botId } = s.rounds[0]!;
    const humans = ps.filter((p) => p.id !== botId).map((p) => p.id);
    for (const id of [botId, ...humans.slice(1)]) s = act(s, id, { type: "vote", targetId: humans[0]! }).state;
    s = act(s, humans[0]!, { type: "vote", targetId: humans[1]! }).state;
    expect(s.phase).toBe("results");
    expect(s.points[botId]).toBe(POINTS.botEscapes);
    expect(s.stats[humans[0]!]).toMatchObject({ framed: 1 });
  });

  test("a tie for the most votes lets the Bot get away", () => {
    let s = readyAll(answerAll(init()));
    const { botId } = s.rounds[0]!;
    const humans = ps.filter((p) => p.id !== botId).map((p) => p.id);
    s = act(s, humans[0]!, { type: "vote", targetId: botId }).state;
    s = act(s, humans[1]!, { type: "vote", targetId: botId }).state;
    s = act(s, humans[2]!, { type: "vote", targetId: humans[0]! }).state;
    s = act(s, botId, { type: "vote", targetId: humans[0]! }).state;
    expect(s.phase).toBe("results");
    expect(botOrNot.view(s, humans[0]!).reveal).toMatchObject({ caught: false });
    expect(s.points[botId]).toBe(POINTS.botEscapes);
    expect(s.points[humans[0]!]).toBe(POINTS.correctVote);
  });

  test("falls back to keyword matching when the judge times out", () => {
    let s = readyAll(answerAll(init()));
    const { botId } = s.rounds[0]!;
    const humans = ps.filter((p) => p.id !== botId).map((p) => p.id);
    for (const id of humans) s = act(s, id, { type: "vote", targetId: botId }).state;
    s = act(s, botId, { type: "vote", targetId: humans[0]! }).state;
    s = act(s, botId, { type: "guess", text: `bring to a desert island ${s.rounds[0]!.pair.real.match(/\d+/)![0]}?` }).state;
    expect(s.phase).toBe("judging");
    s = botOrNot.reduce(s, { type: "tick", now: s.phaseEndsAt }).state;
    expect(s.rounds[0]!.verdict).toEqual({ correct: true });
  });

  test("plays every round to the end on timers alone", () => {
    let s = init();
    let now = T0;
    while (!botOrNot.isOver(s)) {
      now = botOrNot.deadline(s)!;
      s = botOrNot.reduce(s, { type: "tick", now }).state;
    }
    expect(s.rounds).toHaveLength(3);
    expect(new Set(s.rounds.map((r) => r.botId)).size).toBe(3);
  });
});

describe("Survey Says", () => {
  const ps = players(4);
  const init = () =>
    surveySays.init({ players: ps, content: fixtures["survey-says"], spice: "mild", seed: 1, now: T0, pace: 1 }).state;
  const submit = (s: SurveySaysState, playerId: string, answer: string | number, prediction: string | number) =>
    surveySays.reduce(s, { type: "action", playerId, action: { type: "submit", answer, prediction }, now: T0 }).state;

  test("picks a mix of question kinds", () => {
    const kinds = new Set(init().questions.map((q) => q.kind));
    expect(kinds).toEqual(new Set(["who", "scale", "choice"]));
  });

  test("scores each kind of question", () => {
    let s = init();
    while (!surveySays.isOver(s)) {
      const q = s.questions[s.round]!;
      const before = { ...s.points };
      if (q.kind === "scale") {
        s = submit(s, "p0", 2, 5);
        s = submit(s, "p1", 4, 3);
        s = submit(s, "p2", 6, 9);
        s = submit(s, "p3", 8, 5);
        expect(s.results!.average).toBe(5);
        expect(s.points.p0! - before.p0!).toBe(MAX_PREDICTION_POINTS);
        expect(s.points.p1! - before.p1!).toBe(MAX_PREDICTION_POINTS - 80);
        expect(s.points.p2! - before.p2!).toBe(40);
      } else {
        const [a, b] = q.kind === "who" ? ["p1", "p2"] : ["0", "1"];
        s = submit(s, "p0", a!, a!);
        s = submit(s, "p1", a!, b!);
        s = submit(s, "p2", a!, a!);
        s = submit(s, "p3", b!, a!);
        expect(s.results!.winners).toEqual([a]);
        expect(s.points.p1! - before.p1!).toBe(0);
        expect(s.points.p3! - before.p3!).toBe(MAX_PREDICTION_POINTS);
      }
      expect(s.phase).toBe("results");
      s = surveySays.reduce(s, { type: "tick", now: s.phaseEndsAt }).state;
    }
  });

  test("rejects invalid answers", () => {
    let s = init();
    const q = s.questions[0]!;
    s = submit(s, "p0", q.kind === "scale" ? "nope" : 42, 3);
    expect(s.submissions.p0).toBeUndefined();
  });

  test("hides results until the answer phase ends", () => {
    let s = init();
    s = submit(s, "p0", s.questions[0]!.kind === "scale" ? 5 : s.questions[0]!.kind === "who" ? "p1" : "0", 5);
    expect(surveySays.view(s, "p1").results).toBeNull();
    expect(surveySays.view(s, "p1").mySubmission).toBeNull();
  });
});

describe("Skip Logic", () => {
  const ps = players(4);
  const init = () =>
    skipLogic.init({ players: ps, content: fixtures["skip-logic"], spice: "mild", seed: 5, now: T0, pace: 1 }).state;
  const act = (s: SkipLogicState, playerId: string, action: unknown) =>
    skipLogic.reduce(s, { type: "action", playerId, action, now: T0 }).state;
  const doodle = [{ c: 0, w: 1, p: [10, 10, 500, 500] }];

  test("passes chains around so nobody works on the same chain twice", () => {
    let s = init();
    expect(s.totalSteps).toBe(4);
    while (s.phase !== "judging") {
      for (const p of ps) {
        const view = skipLogic.view(s, p.id);
        if (s.phase === "write") expect(view.task!.chain).toBe(ps.indexOf(p));
        else expect(view.task!.previous).not.toBeNull();
        const action =
          s.phase === "draw" ? { type: "draw", strokes: doodle } : { type: s.phase, text: `${p.id} step ${s.step}` };
        s = act(s, p.id, action);
      }
    }
    for (const chain of s.chains) {
      const authors = chain.entries.map((e) => e.authorId);
      expect(new Set(authors).size).toBe(authors.length);
      expect(chain.entries.map((e) => e.kind)).toEqual(["text", "drawing", "text", "drawing"]);
    }
  });

  test("fills timed-out entries and scores hearts", () => {
    let s = init();
    while (s.phase !== "reveal") s = skipLogic.reduce(s, { type: "tick", now: skipLogic.deadline(s)! }).state;
    expect(s.chains.every((c) => c.entries.every((e) => e.timedOut))).toBe(true);

    const entryBy = (author: string) => s.chains[0]!.entries.findIndex((e) => e.authorId === author);
    s = act(s, "p0", { type: "heart", chain: 0, entry: entryBy("p1") });
    s = act(s, "p2", { type: "heart", chain: 0, entry: entryBy("p1") });
    s = act(s, "p1", { type: "heart", chain: 0, entry: entryBy("p1") }); // can't heart yourself
    s = act(s, "p3", { type: "heart", chain: 1, entry: 0 }); // chain not revealed yet
    expect(skipLogic.view(s, "p0").reveal!.myHeart).toBe(entryBy("p1"));
    expect(skipLogic.scores(s)).toMatchObject({ p0: 0, p1: 200, p2: 0, p3: 0 });

    while (!skipLogic.isOver(s)) s = skipLogic.reduce(s, { type: "tick", now: skipLogic.deadline(s)! }).state;
  });

  /** Plays every step with real entries: p-n writes "question n", guesses repeat what they were given. */
  const playAll = (s: SkipLogicState) => {
    let effects: unknown[] = [];
    while (s.phase !== "judging") {
      for (const p of ps) {
        const prev = skipLogic.view(s, p.id).task!.previous;
        const action =
          s.phase === "draw"
            ? { type: "draw", strokes: doodle }
            : s.phase === "write"
              ? { type: "write", text: `How happy are you with ${p.id} the octopus?` }
              : { type: "describe", text: `guess by ${p.id} at step ${s.step}` };
        const step = skipLogic.reduce(s, { type: "action", playerId: p.id, action, now: T0 });
        s = step.state;
        if (step.effects) effects = step.effects;
        void prev;
      }
    }
    return { s, effects };
  };

  test("asks Claude to judge every guess and chain once the last step is done", () => {
    const { s, effects } = playAll(init());
    expect(s.phase).toBe("judging");
    expect(effects).toHaveLength(1);
    const effect = effects[0] as { id: string; kind: string; input: { chains: { chain: number; original: string; hops: { entry: number; drawn: string; guess: string }[] }[] } };
    expect(effect).toMatchObject({ id: "sl-judge", kind: "judge_chains" });
    expect(effect.input.chains).toHaveLength(4);
    const chain0 = effect.input.chains[0]!;
    expect(chain0.original).toBe("How happy are you with p0 the octopus?");
    expect(chain0.hops).toEqual([{ entry: 2, drawn: chain0.original, guess: s.chains[0]!.entries[2]!.kind === "text" ? (s.chains[0]!.entries[2] as { text: string }).text : "" }]);
  });

  test("rewards close guesses for the guesser and the artist, and shows the verdicts", () => {
    let { s } = playAll(init());
    const guesser = s.chains[0]!.entries[2]!.authorId;
    const artist = s.chains[0]!.entries[1]!.authorId;
    const before = skipLogic.scores(s);
    s = skipLogic.reduce(s, {
      type: "effect_result",
      effectId: "sl-judge",
      result: {
        hops: [
          { chain: 0, entry: 2, closeness: 9 },
          { chain: 1, entry: 2, closeness: 6 },
        ],
        chains: [{ chain: 0, drift: 2, quip: "Basically telepathy." }],
      },
      now: T0,
    }).state;
    expect(s.phase).toBe("reveal");
    const after = skipLogic.scores(s);
    expect(after[guesser]! - before[guesser]!).toBeGreaterThanOrEqual(NAILED_IT.points);
    expect(after[artist]! - before[artist]!).toBeGreaterThanOrEqual(NAILED_IT.points);
    const reveal = skipLogic.view(s, "p0").reveal!;
    expect(reveal.verdicts[2]).toEqual({ closeness: 9, bonus: NAILED_IT.points });
    expect(reveal.quip).toBe("Basically telepathy.");
    expect(reveal.drift).toBe(2);
    // Chains Claude didn't mention fall back to keyword matching with a canned verdict.
    s = skipLogic.reduce(s, { type: "skip", now: T0 }).state;
    expect(skipLogic.view(s, "p0").reveal!.verdicts[2]!.bonus).toBe(CLOSE_ENOUGH.points);
    expect(skipLogic.view(s, "p0").reveal!.quip).toBeTruthy();
  });

  test("falls back to keyword judging when Claude doesn't answer in time", () => {
    let { s } = playAll(init());
    s = skipLogic.reduce(s, { type: "tick", now: skipLogic.deadline(s)! }).state;
    expect(s.phase).toBe("reveal");
    expect(s.judgement!.chains).toHaveLength(4);
    expect(Object.keys(s.judgement!.closeness)).toHaveLength(4);
    // Guesses share no keywords with the questions here, so the chains drifted far.
    expect(skipLogic.stats(s)[s.chains[0]!.ownerId]).toMatchObject({ driftWin: 1 });
  });

  test("rejects drawings that are too detailed", () => {
    const huge = Array.from({ length: 10 }, () => ({ c: 0, w: 0, p: Array.from({ length: 2000 }, () => 1) }));
    expect(skipLogic.actionSchema.safeParse({ type: "draw", strokes: huge }).success).toBe(false);
  });
});

describe("categories", () => {
  test("every game has at least one category, and every category has games", () => {
    for (const id of GAME_IDS) expect(GAMES[id].categories.length).toBeGreaterThan(0);
    for (const c of GAME_CATEGORIES) expect(GAME_IDS.filter((id) => GAMES[id].categories.includes(c)).length).toBeGreaterThan(1);
  });
});

describe("the host's +N s button", () => {
  test("every game's first phase records its length, and its deadline follows phaseEndsAt", () => {
    for (const id of GAME_IDS) {
      const def = GAMES[id];
      const count = Math.max(def.minPlayers, Math.min(4, def.maxPlayers));
      const s = def.init({ players: players(count), content: fixtures[id], spice: "mild", seed: 3, now: T0, pace: 1 }).state;
      if (def.live?.(s)) continue;
      expect(s.phaseMs, id).toBeGreaterThan(0);
      const before = def.deadline(s)!;
      s.phaseEndsAt += s.phaseMs;
      expect(def.deadline(s), id).toBe(before + s.phaseMs);
    }
  });
});
