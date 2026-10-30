import { describe, expect, test } from "vitest";
import { miwBotSteps, todoFor } from "../bots";
import type { MatchView } from "../match";
import { fixtures, players as makePlayers } from "../test-helpers";
import {
  MIW_BUDGET,
  MIW_FORMS_PLAYED,
  MIW_POINTS,
  TRAPS,
  TRAP_IDS,
  formCost,
  formProblem,
  makeItWorse,
  miwCheckpoints,
  randomForm,
  type MakeItWorseAction,
  type MakeItWorseState,
  type MakeItWorseView,
  type MiwAnswer,
  type PlacedTrap,
} from "./make-it-worse";

const T0 = 1_000;
const survey = fixtures["make-it-worse"].surveys[0]!;

function start(n = 4, seed = 3) {
  const players = makePlayers(n);
  let s = makeItWorse.init({
    players,
    content: fixtures["make-it-worse"],
    spice: "mild",
    seed,
    now: T0,
    pace: 1,
  }).state;
  let now = T0;
  const act = (playerId: string, action: MakeItWorseAction, at = now) => {
    now = at;
    s = makeItWorse.reduce(s, { type: "action", playerId, action, now }).state;
  };
  return {
    players,
    get s(): MakeItWorseState {
      return s;
    },
    get now() {
      return now;
    },
    set now(t: number) {
      now = t;
    },
    act,
    tick() {
      now = Math.max(now, makeItWorse.deadline(s)!);
      s = makeItWorse.reduce(s, { type: "tick", now }).state;
    },
    leave(playerId: string) {
      s = makeItWorse.reduce(s, { type: "player_left", playerId, now }).state;
    },
    view: (viewer: string | null) => makeItWorse.view(s, viewer),
    /** Everyone locks the same form. */
    buildAll(traps: PlacedTrap[] = []) {
      for (const p of players) act(p.id, { type: "form", traps, lock: true });
    },
    /** Into the current form's play phase. */
    toPlay() {
      while (s.phase !== "play") this.tick();
    },
    submit(
      playerId: string,
      answers: MiwAnswer[] = s.run!.answers,
      extra: Partial<Extract<MakeItWorseAction, { type: "submit" }>> = {},
      at = now,
    ) {
      act(playerId, { type: "submit", answers, fell: [], upsold: false, ...extra }, at);
    },
  };
}

describe("Make It Worse", () => {
  test("has at least 10 traps, each with a trick and a real-world fix, costing 1 to 3", () => {
    expect(TRAP_IDS.length).toBeGreaterThanOrEqual(10);
    for (const id of TRAP_IDS) {
      expect(TRAPS[id].trick.length).toBeGreaterThan(5);
      expect(TRAPS[id].fix.length).toBeGreaterThan(5);
      expect(TRAPS[id].cost).toBeGreaterThanOrEqual(1);
      expect(TRAPS[id].cost).toBeLessThanOrEqual(3);
    }
  });

  test("forms stay within budget, each trap once, on a question it fits", () => {
    expect(formProblem(survey, [{ trap: "runaway" }, { trap: "ghost", question: 1 }])).toBeNull();
    expect(
      formProblem(survey, [
        { trap: "ghost", question: 0 },
        { trap: "ghost", question: 1 },
      ]),
    ).toMatch(/once/);
    expect(formProblem(survey, [{ trap: "reversed", question: 0 }])).toMatch(/doesn't fit/);
    expect(formProblem(survey, [{ trap: "reversed" }])).toMatch(/doesn't fit/);
    expect(formProblem(survey, [{ trap: "slider", question: 2 }])).toBeNull();
    const tooMuch: PlacedTrap[] = [
      { trap: "tabmaze" },
      { trap: "runaway" },
      { trap: "captcha" },
      { trap: "tiny", question: 0 },
    ];
    expect(formCost(tooMuch)).toBeGreaterThan(MIW_BUDGET);
    expect(formProblem(survey, tooMuch)).toMatch(/budget/);
  });

  test("random forms are always valid and spend most of the budget", () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const random = () => (x = (x * 16807) % 2147483647) / 2147483647;
      const traps = randomForm(survey, random);
      expect(formProblem(survey, traps)).toBeNull();
      expect(formCost(traps)).toBeGreaterThanOrEqual(MIW_BUDGET - 1);
    }
  });

  test("a form that breaks the rules is ignored, and building ends once everyone locks", () => {
    const g = start();
    g.act("p0", {
      type: "form",
      traps: [{ trap: "tabmaze" }, { trap: "runaway" }, { trap: "captcha" }, { trap: "tiny", question: 0 }],
    });
    expect(g.s.forms.p0!.traps).toEqual([]);
    g.act("p0", { type: "form", traps: [{ trap: "runaway" }, { trap: "ghost", question: 1 }] });
    expect(g.view("p0").myForm).toEqual({
      traps: [{ trap: "runaway" }, { trap: "ghost", question: 1 }],
      locked: false,
    });
    // Nobody sees anyone else's form while building.
    expect(g.view("p1").myForm!.traps).toEqual([]);
    expect(g.view(null).myForm).toBeNull();
    g.buildAll([{ trap: "modals" }]);
    expect(g.s.phase).toBe("ready");
    expect(g.s.order).toHaveLength(4);
  });

  test("forms left empty get random traps, marked as auto", () => {
    const g = start();
    g.act("p0", { type: "form", traps: [{ trap: "runaway" }], lock: true });
    g.tick();
    expect(g.s.forms.p0).toMatchObject({ traps: [{ trap: "runaway" }], auto: false });
    for (const id of ["p1", "p2", "p3"]) {
      expect(g.s.forms[id]!.auto).toBe(true);
      expect(formProblem(survey, g.s.forms[id]!.traps)).toBeNull();
      expect(g.s.forms[id]!.traps.length).toBeGreaterThan(0);
    }
  });

  test(`big rooms play ${MIW_FORMS_PLAYED} random forms and show the rest in the gallery`, () => {
    const g = start(7);
    g.buildAll([{ trap: "ghost", question: 0 }]);
    expect(g.s.order).toHaveLength(MIW_FORMS_PLAYED);
    expect(new Set(g.s.order).size).toBe(MIW_FORMS_PLAYED);
    for (let i = 0; i < MIW_FORMS_PLAYED; i++) {
      g.toPlay();
      g.tick();
      expect(g.s.phase).toBe("reveal");
      g.tick();
    }
    expect(g.s.phase).toBe("gallery");
    const gallery = g.view(null).gallery;
    expect(gallery).toHaveLength(7 - MIW_FORMS_PLAYED);
    expect(gallery.every((f) => !g.s.order.includes(f.designerId))).toBe(true);
    g.tick();
    expect(makeItWorse.isOver(g.s)).toBe(true);
  });

  test("small rooms play every form and skip the gallery", () => {
    const g = start(3);
    g.buildAll();
    for (let i = 0; i < 3; i++) {
      g.toPlay();
      g.tick();
      g.tick();
    }
    expect(g.s.phase).toBe("done");
  });

  test("everyone but the designer fills in the form; play ends once they've all submitted", () => {
    const g = start();
    g.buildAll([{ trap: "captcha" }]);
    const designer = g.s.order[0]!;
    const view = g.view(designer);
    expect(view.run!.youFill).toBe(false);
    expect(view.run!.fillers).not.toContain(designer);
    expect(view.run!.checkpoints).toBe(survey.questions.length + 2);
    g.toPlay();
    const fillers = g.s.run!.fillers;
    // The designer can't fill in their own form.
    g.submit(designer);
    expect(g.s.run!.submissions[designer]).toBeUndefined();
    g.act(fillers[0]!, { type: "progress", done: 2, stuck: "captcha" });
    expect(g.view(null).run!.progress[fillers[0]!]).toEqual({ done: 2, stuck: "captcha", finished: false });
    for (const id of fillers) g.submit(id);
    expect(g.s.phase).toBe("reveal");
    expect(g.view(null).run!.progress[fillers[0]!]!.finished).toBe(true);
  });

  test("scores right answers and speed for fillers, wrong answers and seconds for the designer", () => {
    const g = start();
    g.buildAll([{ trap: "reversed", question: 1 }, { trap: "runaway" }]);
    g.toPlay();
    const run = g.s.run!;
    const [fast, slow, wrong] = run.fillers as [string, string, string];
    const start0 = g.now;
    const ms = (secs: number) => start0 + secs * 1000;
    g.submit(fast, run.answers, { fell: ["runaway"] }, ms(15));
    g.submit(slow, run.answers, {}, ms(30));
    const bad = [...run.answers];
    bad[1] = 6 - (bad[1] as number);
    g.submit(wrong, bad, {}, ms(45));
    const r = g.s.run!.result!;
    const n = survey.questions.length;
    const speed = (secs: number) => Math.round(MIW_POINTS.speed * (1 - secs / 75));
    expect(r.players.find((p) => p.playerId === fast)!.points).toBe(
      n * MIW_POINTS.correct + MIW_POINTS.finish + speed(15),
    );
    expect(r.players.find((p) => p.playerId === wrong)).toMatchObject({ correct: n - 1, wrong: [1] });
    expect(r.fastestId).toBe(fast);
    expect(r.sued).toBe(false);
    expect(r.traps.find((t) => t.trap === "reversed")!.fellIds).toEqual([wrong]);
    expect(r.traps.find((t) => t.trap === "runaway")!.fellIds).toEqual([fast]);
    const raw = MIW_POINTS.wrong + (15 + 30 + 45) * MIW_POINTS.second;
    expect(r.designerPoints).toBe(Math.round((raw * MIW_POINTS.fillersCounted) / 3));
    expect(g.s.points[run.form.designerId]).toBe(r.designerPoints);
    expect(g.s.stats[fast]!.escapes).toBe(1);
    expect(g.s.stats[slow]!.finePrint).toBe(1);
    expect(g.s.stats[run.form.designerId]!.darkLord).toBe(r.designerPoints);
  });

  test("saying yes to the upsell costs the filler and pays the designer", () => {
    const g = start();
    g.buildAll([{ trap: "confirmshame" }]);
    g.toPlay();
    const [a, b, c] = g.s.run!.fillers as [string, string, string];
    g.submit(a, g.s.run!.answers, { upsold: true });
    g.submit(b);
    g.submit(c);
    const r = g.s.run!.result!;
    expect(
      r.players.find((p) => p.playerId === b)!.points - r.players.find((p) => p.playerId === a)!.points,
    ).toBe(MIW_POINTS.upsold);
    expect(r.traps[0]!.fellIds).toEqual([a]);
    expect(g.s.stats[a]!.upsold).toBe(1);
  });

  test("time the host adds moves the deadline but not anyone's seconds", () => {
    const g = start();
    g.buildAll();
    g.toPlay();
    const started = g.now;
    expect(g.s.phaseMs).toBe(75_000);
    // The match moves the phase's end for the host's "+N s" button.
    g.s.phaseEndsAt += g.s.phaseMs!;
    expect(makeItWorse.deadline(g.s)).toBe(started + 150_000);
    const [a, b, c] = g.s.run!.fillers as [string, string, string];
    g.submit(a, g.s.run!.answers, {}, started + 30_000);
    g.submit(b, g.s.run!.answers, {}, started + 100_000);
    g.submit(c, g.s.run!.answers, {}, started + 100_000);
    const r = g.s.run!.result!;
    expect(r.players.find((p) => p.playerId === a)!.seconds).toBe(30);
    expect(r.players.find((p) => p.playerId === b)!.seconds).toBe(75);
  });

  test("the designer is sued, and scores nothing, when fewer than half finish", () => {
    const g = start();
    g.buildAll([{ trap: "tabmaze" }]);
    g.toPlay();
    const [a, b] = g.s.run!.fillers as [string, string, string];
    g.submit(a);
    g.act(b, { type: "progress", done: 1, stuck: "tabmaze" });
    g.tick();
    const r = g.s.run!.result!;
    expect(r.sued).toBe(true);
    expect(r.designerPoints).toBe(0);
    expect(g.s.points[g.s.run!.form.designerId]).toBe(0);
    expect(g.s.stats[g.s.run!.form.designerId]!.sued).toBe(1);
    // Whoever was stuck when time ran out fell for that trap.
    expect(r.traps[0]!.fellIds).toEqual([b]);
  });

  test("answers of the wrong kind count as blank", () => {
    const g = start();
    g.buildAll();
    g.toPlay();
    const [a] = g.s.run!.fillers as [string];
    g.submit(a, [true, 9, "x" as never, 3]);
    expect(g.s.run!.submissions[a]!.answers).toEqual([null, null, null, null]);
  });

  test("the sticky note never asks for a middle rating, which a backwards scale leaves in place", () => {
    for (let seed = 0; seed < 30; seed++) {
      const g = start(4, seed);
      g.buildAll();
      expect([1, 2, 4, 5]).toContain(g.s.run!.answers[1]);
      const n = g.s.run!.answers[2] as number;
      expect(n).toBeGreaterThan(1);
      expect(n).toBeLessThan(60);
    }
  });

  test("a filler leaving doesn't hold up the form", () => {
    const g = start();
    g.buildAll();
    g.toPlay();
    const [a, b, c] = g.s.run!.fillers as [string, string, string];
    g.submit(a);
    g.submit(b);
    g.leave(c);
    expect(g.s.phase).toBe("reveal");
  });

  test("bots build a valid form, then step through the form and submit before time runs out", () => {
    const g = start();
    const room = (viewer: string, view: MakeItWorseView): MatchView =>
      ({
        phase: "playing",
        game: { gameId: "make-it-worse", players: g.players.map((p) => p.id), view },
      }) as unknown as MatchView;
    const build = todoFor(room("p1", g.view("p1")), "p1")!;
    g.act("p1", build.fallback(Math.random) as MakeItWorseAction);
    expect(g.s.forms.p1!.locked).toBe(true);
    expect(formProblem(survey, g.s.forms.p1!.traps)).toBeNull();
    // A locked form stays as it is.
    g.act("p1", { type: "form", traps: [] });
    expect(g.s.forms.p1!.traps).not.toEqual([]);
    const h = start();
    h.buildAll([{ trap: "modals" }, { trap: "slider", question: 2 }, { trap: "confirmshame" }]);
    h.toPlay();
    const filler = h.s.run!.fillers[0]!;
    const steps = miwBotSteps(survey.questions, h.s.run!.form.traps);
    expect(steps).toHaveLength(miwCheckpoints(survey, h.s.run!.form.traps));
    expect(steps[0]!.stuck).toBe("modals");
    let moves = 0;
    for (
      let todo = todoFor(room(filler, h.view(filler)), filler);
      todo;
      todo = todoFor(room(filler, h.view(filler)), filler)
    ) {
      expect(todo.autoAt).toBeLessThan(h.s.phaseEndsAt);
      h.act(filler, todo.fallback(() => 0.9) as MakeItWorseAction, Math.max(h.now, todo.autoAt));
      moves++;
    }
    expect(moves).toBe(steps.length);
    expect(h.s.run!.submissions[filler]!.answers).toEqual(h.s.run!.answers);
  });
});
