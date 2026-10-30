import { describe, expect, test } from "vitest";
import { doodleBet, todoFor } from "../bots";
import { drawShapes } from "../draw-shapes";
import { GRACE_MS } from "../engine";
import type { MatchView } from "../match";
import { createRng } from "../rng";
import { players as makePlayers } from "../test-helpers";
import {
  DUMMY_ID,
  doodleChampions,
  doodleChampionsActionSchema,
  type DoodleChampionsState,
} from "./doodle-champions";
import {
  ACT,
  DOODLE_LIMITS,
  FRAME_STRIDE,
  fighterRig,
  fighterStats,
  randomFighterShapes,
  resolveFight,
  stockCommentary,
  withNames,
  type FighterStats,
} from "./doodle-fighter";

const T0 = 1_000_000;
const draw = (shapes: string) => drawShapes(shapes, createRng(1).next, DOODLE_LIMITS);
const statsOf = (shapes: string) => fighterStats(draw(shapes));

const BIPED =
  "part body; color teal; fill ellipse 500 450 140 130; color ink; size thick; ellipse 500 450 140 130; part legs; line 440 570 420 830; line 560 570 580 830; part arms; line 640 450 820 380; line 360 450 220 520";
const SPIDER =
  "part body; fill circle 500 600 120; part legs; size medium; line 420 680 300 900; line 450 700 400 900; line 480 710 470 900; line 520 710 530 900; line 550 700 600 900; line 580 680 700 900";
const BALL = "part body; color sun; fill circle 500 700 200; color ink; circle 500 700 200";
const TOWER = "part body; fill rect 450 200 100 600; rect 450 200 100 600";
const PANCAKE = "part body; fill rect 200 780 600 120; rect 200 780 600 120";

describe("Doodle Champions stats", () => {
  test("the same drawing always gives the same stats and rig, whatever its colors", () => {
    const strokes = draw(BIPED);
    const again = draw(BIPED);
    expect(fighterStats(strokes)).toEqual(fighterStats(again));
    expect(fighterRig(strokes)).toEqual(fighterRig(again));
    const recolored = strokes.map((s) => ({ ...s, c: (s.c + 3) % 9 }));
    expect(fighterStats(recolored)).toEqual(fighterStats(strokes));
  });

  test("counts legs and arms where they touch the body, with a pivot at the joint", () => {
    const rig = fighterRig(draw(BIPED));
    const legs = rig.limbs.filter((l) => l.part === "legs");
    expect(legs).toHaveLength(2);
    expect(rig.limbs.filter((l) => l.part === "arms")).toHaveLength(2);
    // A leg's pivot is at its top, where it meets the body, and its tip is on the floor.
    for (const leg of legs) {
      expect(leg.pivot[1]).toBeLessThan(620);
      expect(leg.tip[1]).toBeGreaterThan(800);
    }
    expect(rig.feet).toBeGreaterThan(820);
    expect(rig.facesRight).toBe(true);
  });

  test("a foot drawn as a second stroke joins its leg instead of counting as another", () => {
    const stats = statsOf(`${BIPED}; part legs; line 420 830 360 830; line 580 830 640 830`);
    expect(stats.legs).toBe(2);
  });

  test("legs make speed, many short legs scuttle, no legs hop, roll or slide", () => {
    expect(statsOf(BIPED).style).toBe("walk");
    const spider = statsOf(SPIDER);
    expect(spider.legs).toBe(6);
    expect(spider.style).toBe("scuttle");
    expect(statsOf(BALL)).toMatchObject({ legs: 0, style: "roll" });
    expect(statsOf(TOWER)).toMatchObject({ legs: 0, style: "hop", topples: true, noodle: true });
    expect(statsOf(PANCAKE)).toMatchObject({ legs: 0, style: "slide" });
  });

  test("a bigger body is tougher and heavier but slower", () => {
    const small = statsOf(
      "part body; fill circle 500 500 80; part legs; line 470 570 470 800; line 530 570 530 800",
    );
    const big = statsOf(
      "part body; fill circle 500 500 300; part legs; line 470 790 470 900; line 530 790 530 900",
    );
    expect(big.hp).toBeGreaterThan(small.hp);
    expect(big.mass).toBeGreaterThan(small.mass);
    expect(big.speed).toBeLessThan(small.speed);
  });

  test("arms add reach and attacks, a weapon adds damage and reach but slows the swing", () => {
    const armless = statsOf("part body; fill circle 500 500 150");
    const armed = statsOf(
      "part body; fill circle 500 500 150; part arms; size thick; line 650 500 850 450; line 350 500 150 450",
    );
    expect(armed.reach).toBeGreaterThan(armless.reach);
    expect(armed.cooldown).toBeLessThan(armless.cooldown);
    const sword = statsOf(
      "part body; fill circle 500 500 150; part arms; size thick; line 650 500 850 450; part weapon; size huge; line 850 450 900 80; fill rect 830 60 140 120",
    );
    expect(sword.damage).toBeGreaterThan(armed.damage);
    expect(sword.reach).toBeGreaterThan(armed.reach);
    expect(sword.cooldown).toBeGreaterThan(armed.cooldown - 2);
    expect(
      fighterRig(
        draw(
          "part body; fill circle 500 500 150; part arms; line 650 500 850 450; part weapon; line 850 450 900 80",
        ),
      ).weapon?.arm,
    ).not.toBeNull();
  });

  test("untagged strokes count as body, so any drawing makes a fighter", () => {
    const stats = statsOf("circle 500 500 200");
    expect(stats.legs).toBe(0);
    expect(stats.hp).toBeGreaterThan(0);
  });

  test("every random fighter is a valid move with a body", () => {
    const rng = createRng(3);
    for (let i = 0; i < 40; i++) {
      const strokes = drawShapes(randomFighterShapes(rng.next), rng.next, DOODLE_LIMITS);
      expect(doodleChampionsActionSchema.safeParse({ type: "fighter", strokes }).success).toBe(true);
      expect(strokes.some((s) => s.t === "body")).toBe(true);
    }
  });
});

const fighter = (id: string, shapes: string) => ({ id, stats: statsOf(shapes) });
const xOf = (frame: number[], i: number) => frame[i * FRAME_STRIDE]!;

describe("Doodle Champions fights", () => {
  test("the same fighters and seed always fight the same fight", () => {
    const a = resolveFight([fighter("a", BIPED), fighter("b", SPIDER)], 42, 150);
    const b = resolveFight([fighter("a", BIPED), fighter("b", SPIDER)], 42, 150);
    expect(a).toEqual(b);
    const c = resolveFight([fighter("a", BIPED), fighter("b", SPIDER)], 43, 150);
    expect(c.frames).not.toEqual(a.frames);
  });

  test("every fight ends in a knockout, a decision or a draw, within the tick limit", () => {
    const pool = [BIPED, SPIDER, BALL, TOWER, PANCAKE];
    for (let seed = 0; seed < 30; seed++) {
      const fight = resolveFight(
        [fighter("a", pool[seed % 5]!), fighter("b", pool[(seed + 2) % 5]!)],
        seed,
        150,
      );
      expect(fight.frames.length).toBeLessThanOrEqual(151);
      expect(["ko", "decision", "draw"]).toContain(fight.how);
      expect(fight.placing.toSorted()).toEqual(["a", "b"]);
      if (fight.how === "ko") {
        expect(fight.winnerId).not.toBeNull();
        const loser = fight.fighters.indexOf(fight.placing[1]!);
        expect(fight.frames.at(-1)![loser * FRAME_STRIDE + 3]).toBe(ACT.ko);
        expect(fight.events.some((e) => e.k === "ko")).toBe(true);
      }
      if (fight.how === "draw") expect(fight.winnerId).toBeNull();
    }
  });

  test("legless fighters still get around: hopping, rolling and sliding", () => {
    for (const shapes of [BALL, TOWER, PANCAKE]) {
      const fight = resolveFight(
        [fighter("blob", shapes), fighter("stand", "part body; fill circle 500 500 100")],
        5,
        150,
      );
      const xs = fight.frames.map((f) => xOf(f, 0));
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    }
    const hopper = resolveFight([fighter("hop", TOWER), fighter("b", BIPED)], 9, 60);
    expect(hopper.frames.some((f) => f[1]! > 0)).toBe(true);
  });

  test("a free-for-all places everyone and credits knockouts", () => {
    const pool = [BIPED, SPIDER, BALL, TOWER, PANCAKE, BIPED];
    const fight = resolveFight(
      pool.map((shapes, i) => fighter(`f${i}`, shapes)),
      11,
      220,
    );
    expect(fight.placing).toHaveLength(6);
    expect(fight.winnerId).toBe(fight.placing[0]);
    for (const [victim, by] of Object.entries(fight.koBy)) {
      expect(victim).not.toBe(by);
      expect(fight.placing.indexOf(victim)).toBeGreaterThan(0);
    }
  });

  test("stock commentary opens, names fighters by number and calls the finish", () => {
    const stats: FighterStats[] = [statsOf(BIPED), statsOf(BALL)];
    const fight = resolveFight(
      [
        { id: "a", stats: stats[0]! },
        { id: "b", stats: stats[1]! },
      ],
      3,
      150,
    );
    const lines = stockCommentary(fight, [4, 7], stats, 3);
    expect(lines[0]!.t).toBe(0);
    expect(lines.at(-1)!.t).toBe(fight.frames.length - 1);
    const names = ["", "", "", "Sir Doodle", "", "", "Bouncy"];
    expect(lines.map((l) => withNames(l.text, names)).join(" ")).not.toMatch(/\{/);
  });
});

const ps = makePlayers(4);
const init = (n = 4) =>
  doodleChampions.init({ players: makePlayers(n), content: {}, spice: "mild", seed: 7, now: T0, pace: 1 })
    .state;
const act = (s: DoodleChampionsState, playerId: string, action: unknown, now = T0) =>
  doodleChampions.reduce(s, { type: "action", playerId, action, now }).state;
const skip = (s: DoodleChampionsState, now = T0) => doodleChampions.reduce(s, { type: "skip", now });

function drawAll(s: DoodleChampionsState, ids: string[]) {
  const pool = [BIPED, SPIDER, BALL, TOWER];
  ids.forEach((id, i) => (s = act(s, id, { type: "fighter", strokes: draw(pool[i % pool.length]!) })));
  return s;
}

describe("Doodle Champions game", () => {
  test("drawings stay secret until the weigh-in, then everyone's fighter shows", () => {
    let s = init();
    s = act(s, "p0", { type: "fighter", strokes: draw(BIPED) });
    const other = doodleChampions.view(s, "p1");
    expect(other.fighters).toEqual([]);
    expect(other.myDrawing).toBeNull();
    expect(other.submittedIds).toEqual(["p0"]);
    expect(JSON.stringify(other)).not.toContain(JSON.stringify(s.drawings.p0![0]!.p));
    expect(doodleChampions.view(s, "p0").myDrawing).toEqual(s.drawings.p0);
    // A second fighter doesn't replace the first.
    const again = act(s, "p0", { type: "fighter", strokes: draw(BALL) });
    expect(again.drawings.p0).toEqual(s.drawings.p0);

    s = drawAll(s, ["p1", "p2", "p3"]);
    expect(s.phase).toBe("weighin");
    expect(doodleChampions.view(s, "p1").fighters).toHaveLength(4);
  });

  test("players who don't draw in time get a fighter drawn for them, and an odd count gets the dummy", () => {
    let s = init(3);
    s = act(s, "p0", { type: "fighter", strokes: draw(BIPED) });
    const step = doodleChampions.reduce(s, { type: "tick", now: s.phaseEndsAt + GRACE_MS });
    s = step.state;
    expect(s.phase).toBe("weighin");
    expect(s.fighters.map((f) => [f.id, f.auto])).toEqual([
      ["p0", false],
      ["p1", true],
      ["p2", true],
      [DUMMY_ID, false],
    ]);
    // Everyone fights in every duel round, and the free-for-all is the players' fighters only.
    expect(s.rounds.map((r) => r.kind)).toEqual(["duel", "duel", "duel", "ffa"]);
    for (const r of s.rounds.slice(0, 3))
      expect(r.matches.flat().toSorted()).toEqual(["dummy", "p0", "p1", "p2"]);
    const pairs = s.rounds.slice(0, 3).flatMap((r) => r.matches.map((m) => m.toSorted().join("-")));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(s.rounds[3]!.matches).toEqual([["p0", "p1", "p2"]]);
    // Claude is asked to name the fighters and commentate every fight.
    expect(step.effects).toEqual([expect.objectContaining({ kind: "name_fighters" })]);
    const input = step.effects![0]!.kind === "name_fighters" ? step.effects![0]!.input : null;
    expect(input?.fighters).toHaveLength(4);
    expect(input?.fights).toHaveLength(7);
  });

  test("Claude's names and lines are used, and anything unusable keeps the stock version", () => {
    let s = drawAll(init(), ["p0", "p1", "p2", "p3"]);
    const stock = s.fighters.map((f) => f.name);
    s = doodleChampions.reduce(s, {
      type: "effect_result",
      effectId: "dc-names",
      result: {
        names: [
          { n: 1, name: "Sir Stomps" },
          { n: 2, name: "" },
          { n: 3, name: "Sir Stomps" },
          { n: 9, name: "Nobody" },
        ],
        fights: [{ key: "0:0", lines: ["{1} enters!", "Wow.", "{1} wins!"] }],
      },
      now: T0,
    }).state;
    expect(s.fighters.map((f) => f.name)).toEqual(["Sir Stomps", stock[1], stock[2], stock[3]]);
    expect(s.commentator).toBe("claude");
    s = skip(s).state; // to the bet
    s = skip(s).state; // to the fight
    const captions = doodleChampions.view(s, "p0").fights![0]!.captions;
    expect(captions.map((c) => c.text)).toEqual(["{1} enters!", "Wow.", "{1} wins!"]);
    // Without Claude, the stock lines play.
    const offline = skip(skip(drawAll(init(), ["p0", "p1", "p2", "p3"])).state).state;
    const fightView = doodleChampions.view(skip(offline).state, "p0");
    expect(fightView.commentator).toBe("stock");
    expect(fightView.fights![0]!.captions.length).toBeGreaterThanOrEqual(2);
  });

  test("bets stay hidden until the round's fights are over, then pay the odds or cost the stake", () => {
    let s = drawAll(init(), ["p0", "p1", "p2", "p3"]);
    s = skip(s).state;
    expect(s.phase).toBe("bet");
    const round = s.rounds[0]!;
    const [a, b] = round.matches[0]!;
    // Only fighters in this round's fights, and only the listed stakes.
    expect(act(s, "p0", { type: "bet", targetId: "nobody", stake: 50 }).rounds[0]!.bets.p0).toBeUndefined();
    expect(doodleChampionsActionSchema.safeParse({ type: "bet", targetId: a, stake: 75 }).success).toBe(
      false,
    );
    s = act(s, "p0", { type: "bet", targetId: a!, stake: 100 });
    s = act(s, "p1", { type: "bet", targetId: b!, stake: 50 });
    const betView = doodleChampions.view(s, "p2");
    expect(betView.bettedIds.toSorted()).toEqual(["p0", "p1"]);
    expect(betView.myBet).toBeNull();
    expect(betView.bets).toBeNull();
    expect(betView.fights).toBeNull();
    expect(JSON.stringify(betView)).not.toContain('"winnerId"');
    expect(doodleChampions.view(s, "p0").myBet).toEqual({ targetId: a, stake: 100 });

    s = skip(s).state;
    expect(s.phase).toBe("fight");
    expect(doodleChampions.view(s, "p2").bets).toBeNull();
    const before = { ...s.points };
    s = skip(s).state;
    expect(s.phase).toBe("results");
    const fight = s.rounds[0]!.fights![0]!;
    const view = doodleChampions.view(s, "p2");
    expect(view.bets).not.toBeNull();
    const expected = (id: string, stake: number) =>
      fight.winnerId === null ? 0 : fight.winnerId === id ? Math.round(stake * round.odds[id]!) : -stake;
    expect(view.bets!.p0!.delta).toBe(expected(a!, 100));
    expect(view.bets!.p1!.delta).toBe(expected(b!, 50));
    // Points: the bet plus whatever the bettor's own fighter won.
    for (const id of ["p0", "p1"]) {
      expect(s.points[id]! - before[id]!).toBe(s.rounds[0]!.roundPoints[id] ?? 0);
    }
    expect(s.rounds[0]!.roundPoints.p0! - (s.rounds[0]!.betResults.p0 ?? 0)).toBeGreaterThanOrEqual(0);
  });

  test("the betting window closes early once everyone has bet", () => {
    let s = skip(drawAll(init(), ["p0", "p1", "p2", "p3"])).state;
    const target = s.rounds[0]!.matches[0]![0]!;
    for (const id of ["p0", "p1", "p2", "p3"]) s = act(s, id, { type: "bet", targetId: target, stake: 25 });
    expect(s.phase).toBe("fight");
    // The fight phase lasts as long as the longest fight, plus a beat.
    const longest = Math.max(...s.rounds[0]!.fights!.map((f) => f.frames.length));
    expect(s.phaseEndsAt - s.phaseStartedAt).toBeGreaterThanOrEqual(longest * 100);
  });

  test("plays a full game on timeouts alone: duels, then the free-for-all, then done", () => {
    let s = init(5);
    let now = T0;
    for (let i = 0; i < 100 && s.phase !== "done"; i++) {
      now = doodleChampions.deadline(s)!;
      s = doodleChampions.reduce(s, { type: "tick", now }).state;
    }
    expect(s.phase).toBe("done");
    expect(s.fighters).toHaveLength(6);
    expect(s.rounds.at(-1)!.kind).toBe("ffa");
    const scores = doodleChampions.scores(s);
    expect(Object.keys(scores).toSorted()).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    // Somebody won something, and the free-for-all champion has the award stat.
    expect(Math.max(...Object.values(scores))).toBeGreaterThan(0);
    expect(Object.values(doodleChampions.stats(s)).some((row) => row.ffaWins)).toBe(true);
    // Finished rounds keep who won but drop their frames, except the free-for-all, which stays on screen.
    expect(s.rounds.slice(0, -1).every((r) => r.fights!.every((f) => f.frames.length === 0))).toBe(true);
    expect(doodleChampions.view(s, "p0").fights![0]!.frames.length).toBeGreaterThan(1);
  });

  test("bots draw a fighter and bet through their todos", () => {
    let s = init();
    const wrap = (game: unknown): MatchView =>
      ({
        phase: "playing",
        game: { gameId: "doodle-champions", players: ps.map((p) => p.id), view: game, deadline: null },
      }) as unknown as MatchView;
    const random = createRng(9).next;
    for (const p of ps) {
      const todo = todoFor(wrap(doodleChampions.view(s, p.id)), p.id)!;
      expect(todo.hint).toMatch(/part body/);
      const move = doodleChampionsActionSchema.parse(todo.fallback(random));
      s = act(s, p.id, move);
    }
    expect(s.phase).toBe("weighin");
    expect(todoFor(wrap(doodleChampions.view(s, "p0")), "p0")).toBeNull();
    s = skip(s).state;
    for (const p of ps) {
      const todo = todoFor(wrap(doodleChampions.view(s, p.id)), p.id)!;
      expect(todo.hint).toMatch(/"type":"bet"/);
      s = act(s, p.id, doodleChampionsActionSchema.parse(todo.fallback(random)));
    }
    expect(s.phase).toBe("fight");
    const bet = doodleBet(
      { matches: [["a", "b"]], odds: { a: 0.4, b: 2.5 }, stakes: [25, 50, 100] },
      () => 0.1,
    );
    expect(bet?.targetId).toBe("b");
    expect(bet?.stake).toBe(25);
  });

  test("a player who leaves mid-draw doesn't hold up the game", () => {
    let s = init();
    s = drawAll(s, ["p0", "p1", "p2"]);
    expect(s.phase).toBe("draw");
    s = doodleChampions.reduce(s, { type: "player_left", playerId: "p3", now: T0 }).state;
    expect(s.phase).toBe("weighin");
    expect(s.fighters.map((f) => f.id)).toEqual(["p0", "p1", "p2", DUMMY_ID]);
  });
});
