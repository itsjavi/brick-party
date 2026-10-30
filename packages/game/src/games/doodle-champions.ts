import { z } from "zod";
import {
  GRACE_MS,
  addPoints,
  bumpStat,
  seconds,
  zeroPoints,
  type GameDefinition,
  type GameEffect,
  type GameEvent,
  type NameFightersInput,
  type NameFightersResult,
  type Step,
} from "../engine";
import { createRng } from "../rng";
import type { GameStats, PlayerId, PlayerInfo } from "../types";
import {
  DOODLE_LIMITS,
  DUMMY_SHAPES,
  TICK_MS,
  fighterRig,
  fighterStats,
  partOf,
  randomFighterShapes,
  resolveFight,
  shapesToFighter,
  stockCommentary,
  stockName,
  styleLine,
  type Caption,
  type FightResult,
  type FighterRig,
  type FighterStats,
} from "./doodle-fighter";
import { strokeSchema, type Stroke } from "./skip-logic";

/**
 * Doodle Champions: everyone draws a fighter part by part, then the fighters battle. Short duels run side by side,
 * a few rounds of them, with a betting window before each, and the game ends with one free-for-all. The server
 * resolves every fight from a seed (doodle-fighter.ts) and every screen replays the same frames.
 */

const DRAW_SECONDS = 90;
const WEIGH_IN_SECONDS = 14;
const FIRST_BET_SECONDS = 20;
const BET_SECONDS = 15;
/** Time after a fight's last frame, so the finish lands before the results. */
const FIGHT_TAIL_SECONDS = 2.5;
const RESULTS_SECONDS = 9;
const FINAL_RESULTS_SECONDS = 12;
/** Duel rounds before the free-for-all (fewer when there aren't enough fighters for new pairings). */
const DUEL_ROUNDS = 3;
const DUEL_TICKS = 150;
const FFA_TICKS = 220;
const NAME_EFFECT_ID = "dc-names";
export const DUMMY_ID = "dummy";
export const DUMMY_NAME = "The Training Dummy";

export const DOODLE_STAKES = [25, 50, 100] as const;

export const DOODLE_POINTS = {
  win: 150,
  /** On top of the win, for a knockout. */
  knockout: 50,
  draw: 50,
  /** Free-for-all: first, second and third. */
  ffa: [300, 150, 75],
  /** Free-for-all: per fighter knocked out. */
  ffaKnockout: 50,
} as const;

const fighterSchema = z
  .array(strokeSchema)
  .min(1)
  .max(DOODLE_LIMITS.maxStrokes)
  .refine(
    (strokes) => strokes.reduce((n, s) => n + s.p.length, 0) <= DOODLE_LIMITS.maxValues,
    "Fighter too detailed",
  );

export const doodleChampionsContentSchema = z.object({});
export type DoodleChampionsContent = z.infer<typeof doodleChampionsContentSchema>;

export const doodleChampionsActionSchema = z.discriminatedUnion("type", [
  /** Your fighter, drawn in parts (each stroke's `t`). Untagged strokes count as body. */
  z.object({ type: z.literal("fighter"), strokes: fighterSchema }),
  /** A bet on one fighter in this round's fights: a fighter id (its owner's player id, or "dummy"). */
  z.object({
    type: z.literal("bet"),
    targetId: z.string().min(1).max(64),
    stake: z
      .number()
      .int()
      .refine((n) => (DOODLE_STAKES as readonly number[]).includes(n), `Stake ${DOODLE_STAKES.join(", ")}`),
  }),
]);
export type DoodleChampionsAction = z.infer<typeof doodleChampionsActionSchema>;

type Phase = "draw" | "weighin" | "bet" | "fight" | "results" | "done";

export interface DoodleFighter {
  /** The owner's player id, or `DUMMY_ID`. */
  id: string;
  ownerId: PlayerId | null;
  strokes: Stroke[];
  stats: FighterStats;
  rig: FighterRig;
  name: string;
  /** Drawn by the game because its owner ran out of time. */
  auto: boolean;
}

export interface DoodleBet {
  targetId: string;
  stake: number;
}

export interface DoodleFight extends FightResult {
  /** `${round}:${match}`, the key for its commentary. */
  key: string;
  /** Stock commentary, used when Claude wrote none. */
  stock: Caption[];
}

export interface DoodleRound {
  kind: "duel" | "ffa";
  /** Fighter ids per fight. */
  matches: string[][];
  /** What a winning bet pays per point staked, by fighter id (on top of the stake coming back). */
  odds: Record<string, number>;
  bets: Record<PlayerId, DoodleBet>;
  /** Set once the fights start. Frames are dropped when the round is over. */
  fights: DoodleFight[] | null;
  /** What each bet won or lost, once the round is settled. */
  betResults: Record<PlayerId, number>;
  roundPoints: Record<PlayerId, number>;
}

export interface DoodleRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface DoodleChampionsState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  drawings: Record<PlayerId, Stroke[]>;
  fighters: DoodleFighter[];
  roundIndex: number;
  rounds: DoodleRound[];
  /** Claude's lines by fight key: opening, middle and finish. */
  commentary: Record<string, string[]>;
  commentator: "claude" | "stock";
  records: Record<string, DoodleRecord>;
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

export interface DoodleFighterView extends DoodleFighter {
  /** Its number in the game, 1-based: the `{n}` in commentary. */
  n: number;
  record: DoodleRecord;
}

export interface DoodleFightView extends Omit<DoodleFight, "stock"> {
  captions: Caption[];
}

export interface DoodleChampionsView {
  phase: Phase;
  endsAt: number;
  startedAt: number;
  round: number;
  totalRounds: number;
  kind: DoodleRound["kind"] | null;
  /** Who has handed in a fighter, during the draw. */
  submittedIds: PlayerId[];
  /** Your own fighter as you handed it in, during the draw. */
  myDrawing: Stroke[] | null;
  /** Every fighter, once the drawing is over. Empty during the draw: drawings stay secret until then. */
  fighters: DoodleFighterView[];
  matches: string[][];
  odds: Record<string, number>;
  stakes: readonly number[];
  /** Who has bet this round (not on what). */
  bettedIds: PlayerId[];
  myBet: DoodleBet | null;
  /** Everyone's bets and what they paid, once the round's fights are over. */
  bets: Record<PlayerId, DoodleBet & { delta: number }> | null;
  /** This round's fights, with frames, from the moment they start. */
  fights: DoodleFightView[] | null;
  roundPoints: Record<PlayerId, number>;
  points: Record<PlayerId, number>;
  commentator: "claude" | "stock";
}

type S = DoodleChampionsState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));
const current = (s: S): DoodleRound | undefined => s.rounds[s.roundIndex];
const mix = (...parts: number[]) => parts.reduce((h, p) => Math.imul(h ^ p, 0x9e3779b1) >>> 0, 0x2545f491);
const fightSeed = (s: S, round: number, match: number) => mix(s.seed, round + 1, match + 1);
const fighterOf = (s: S, id: string) => s.fighters.find((f) => f.id === id);
const numberOf = (s: S, id: string) => s.fighters.findIndex((f) => f.id === id) + 1;

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  return s.phase === "draw" || s.phase === "bet" ? s.phaseEndsAt + GRACE_MS : s.phaseEndsAt;
}

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseStartedAt = now;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

/** Pairings with no rematches (the circle method): `rounds` rounds of duels for an even number of fighters. */
function roundRobin(ids: string[], rounds: number): string[][][] {
  const ring = [...ids];
  const out: string[][][] = [];
  for (let r = 0; r < rounds; r++) {
    const pairs: string[][] = [];
    for (let i = 0; i < ring.length / 2; i++) pairs.push([ring[i]!, ring[ring.length - 1 - i]!]);
    out.push(pairs);
    ring.splice(1, 0, ring.pop()!);
  }
  return out;
}

/** What a winning bet pays per point staked: about fair from the fighters' power, a little kinder to underdogs. */
function oddsFor(s: S, matches: string[][], kind: DoodleRound["kind"]): Record<string, number> {
  const odds: Record<string, number> = {};
  for (const match of matches) {
    // Squared power matches how often the stronger fighter wins, measured over many random fights.
    const powers = match.map((id) => Math.max(1, fighterOf(s, id)?.stats.power ?? 1) ** 2);
    const total = powers.reduce((a, b) => a + b, 0);
    match.forEach((id, i) => {
      const p = powers[i]! / total;
      // Kept between 0.5 and 3 (4 in the free-for-all), so backing the favorite still pays and long shots stay sane.
      odds[id] = Math.min(kind === "ffa" ? 4 : 3, Math.max(0.5, Math.round((1 / p - 1) * 1.2 * 10) / 10));
    });
  }
  return odds;
}

function newRound(s: S, kind: DoodleRound["kind"], matches: string[][]): DoodleRound {
  return {
    kind,
    matches,
    odds: oddsFor(s, matches, kind),
    bets: {},
    fights: null,
    betResults: {},
    roundPoints: {},
  };
}

function resolveRound(s: S, round: number): DoodleFight[] {
  const r = s.rounds[round]!;
  return r.matches.map((match, m) => {
    const fighters = match.map((id) => fighterOf(s, id)!);
    const seed = fightSeed(s, round, m);
    const fight = resolveFight(
      fighters.map((f) => ({ id: f.id, stats: f.stats })),
      seed,
      r.kind === "ffa" ? FFA_TICKS : DUEL_TICKS,
    );
    const stock = stockCommentary(
      fight,
      fighters.map((f) => numberOf(s, f.id)),
      fighters.map((f) => f.stats),
      seed,
    );
    return { ...fight, key: `${round}:${m}`, stock };
  });
}

function describeBody(st: FighterStats): string {
  const words: string[] = [];
  if (st.noodle) words.push("noodle-thin");
  if (st.roundness >= 0.86) words.push("round");
  if (st.topples) words.push("tall");
  if (st.tallness < 0.6) words.push("flat and wide");
  if (st.mass >= 2.5) words.push("huge");
  if (st.mass <= 0.7) words.push("tiny");
  return words.join(", ") || "ordinary";
}

function describeWeapon(f: DoodleFighter): string {
  if (!f.rig.weapon) return "none";
  const size = f.stats.weaponInk > 15000 ? "huge" : f.stats.weaponLength > 400 ? "long" : "small";
  return `${size}, ${f.rig.weapon.arm !== null ? "held in a hand" : "stuck to the body"}`;
}

const COLOR_NAMES = ["black", "white", "red", "yellow", "teal", "blue", "purple", "pink", "gray"];

/** Every fighter and every fight of the game for Claude, described by shapes and what happened. */
function nameInput(s: S): NameFightersInput {
  const fights: NameFightersInput["fights"] = [];
  s.rounds.forEach((r, round) => {
    resolveRound(s, round).forEach((fight) => {
      const nums = fight.fighters.map((id) => numberOf(s, id));
      const tag = (i: number) => `{${nums[i]}}`;
      const count = (k: string, i: number) => fight.events.filter((e) => e.k === k && e.a === i).length;
      const moments: string[] = [];
      fight.fighters.forEach((id, i) => {
        const crits = count("crit", i);
        if (crits) moments.push(`${tag(i)} landed ${crits} big hit${crits > 1 ? "s" : ""}`);
        if (count("topple", i)) moments.push(`${tag(i)} toppled over`);
        if (count("wall", i)) moments.push(`${tag(i)} was knocked into the wall`);
        if (count("miss", i) >= 4) moments.push(`${tag(i)} missed a lot`);
        const style = fighterOf(s, id)!.stats.style;
        if (style === "roll" || style === "hop" || style === "slide" || style === "scuttle")
          moments.push(`${tag(i)} ${style}s around`);
      });
      fights.push({
        key: fight.key,
        fighters: nums,
        winner: fight.winnerId === null ? null : numberOf(s, fight.winnerId),
        how: fight.how === "ko" ? "KO" : fight.how,
        seconds: Math.round((fight.frames.length * TICK_MS) / 1000),
        moments: moments.slice(0, 5),
      });
    });
  });
  return {
    fighters: s.fighters.map((f, i) => {
      const inks = new Map<number, number>();
      for (const st of f.strokes)
        if (partOf(st) === "body") inks.set(st.c, (inks.get(st.c) ?? 0) + st.p.length);
      const color = [...inks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      return {
        n: i + 1,
        body: describeBody(f.stats),
        legs: f.stats.legs,
        arms: f.stats.arms,
        weapon: describeWeapon(f),
        moves: styleLine(f.stats),
        color: COLOR_NAMES[color] ?? "black",
        stockName: f.name,
      };
    }),
    fights,
  };
}

/** Takes Claude's names and lines where they're usable; anything missing or odd keeps the stock version. */
function applyNames(s: S, result: NameFightersResult | null) {
  if (!result || typeof result !== "object") return;
  const clean = (text: unknown, max: number) =>
    typeof text === "string"
      ? text
          .replace(/[\r\n<>]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, max)
      : "";
  const taken = new Set<string>();
  let named = false;
  for (const entry of Array.isArray(result.names) ? result.names : []) {
    const fighter = s.fighters[(entry?.n ?? 0) - 1];
    const name = clean(entry?.name, 24).replace(/[{}]/g, "");
    if (!fighter || fighter.id === DUMMY_ID || name.length < 2 || taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    fighter.name = name;
    named = true;
  }
  for (const entry of Array.isArray(result.fights) ? result.fights : []) {
    const lines = (Array.isArray(entry?.lines) ? entry.lines : [])
      .map((l) => clean(l, 110))
      .filter((l) => l.length > 1);
    if (typeof entry?.key === "string" && /^\d+:\d+$/.test(entry.key) && lines.length) {
      s.commentary[entry.key] = lines.slice(0, 3);
      named = true;
    }
  }
  if (named) s.commentator = "claude";
}

/** Turns the drawings into fighters, adds the dummy for an odd count, pairs everyone and starts the weigh-in. */
function startWeighIn(s: S, now: number): Step<S> {
  const rng = createRng(mix(s.seed, 0xd00d1e));
  const fighters: DoodleFighter[] = [];
  s.players.forEach((p, i) => {
    let strokes = s.drawings[p.id];
    let auto = false;
    if (!strokes?.length) {
      if (s.left.includes(p.id)) return;
      strokes = shapesToFighter(randomFighterShapes(rng.next), rng.next);
      auto = true;
    }
    const rig = fighterRig(strokes);
    const stats = fighterStats(strokes, rig);
    fighters.push({
      id: p.id,
      ownerId: p.id,
      strokes,
      rig,
      stats,
      name: stockName(stats, strokes, mix(s.seed, i)),
      auto,
    });
    if (stats.legs >= 3) bumpStat(s.stats, p.id, "legs", stats.legs);
  });
  if (fighters.length % 2 === 1) {
    const strokes = shapesToFighter(DUMMY_SHAPES, createRng(7).next);
    const rig = fighterRig(strokes);
    fighters.push({
      id: DUMMY_ID,
      ownerId: null,
      strokes,
      rig,
      stats: fighterStats(strokes, rig),
      name: DUMMY_NAME,
      auto: false,
    });
  }
  // Two stock names alike get a number.
  const seen = new Map<string, number>();
  for (const f of fighters) {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    if (n > 1) f.name = `${f.name.slice(0, 20)} ${["", "", "II", "III", "IV"][n] ?? n}`.trim();
  }
  s.fighters = fighters;
  // The fighters hold the strokes now.
  s.drawings = {};
  s.records = Object.fromEntries(fighters.map((f) => [f.id, { wins: 0, losses: 0, draws: 0 }]));
  if (fighters.length < 2) {
    s.phase = "done";
    return { state: s };
  }
  const duels = roundRobin(
    rng.shuffle(fighters.map((f) => f.id)),
    Math.min(DUEL_ROUNDS, fighters.length - 1),
  );
  const players = fighters.filter((f) => f.id !== DUMMY_ID).map((f) => f.id);
  s.rounds = [
    ...duels.map((m) => newRound(s, "duel", m)),
    ...(players.length >= 2 ? [newRound(s, "ffa", [players])] : []),
  ];
  setPhase(s, "weighin", now, WEIGH_IN_SECONDS);
  const effects: GameEffect[] = [{ id: NAME_EFFECT_ID, kind: "name_fighters", input: nameInput(s) }];
  return { state: s, effects };
}

function startBet(s: S, round: number, now: number) {
  s.roundIndex = round;
  setPhase(s, "bet", now, round === 0 ? FIRST_BET_SECONDS : BET_SECONDS);
}

function startFight(s: S, now: number) {
  const r = current(s)!;
  r.fights = resolveRound(s, s.roundIndex);
  const longest = Math.max(...r.fights.map((f) => f.frames.length));
  setPhase(s, "fight", now, (longest * TICK_MS) / 1000 + FIGHT_TAIL_SECONDS);
}

/** Points for the fighters' owners, the bets paid out, and the stats behind the awards. */
function settle(s: S, now: number) {
  const r = current(s)!;
  const owner = (id: string) => {
    const o = fighterOf(s, id)?.ownerId;
    return o && !s.left.includes(o) ? o : null;
  };
  const give = (id: string | null, pts: number) => id && addPoints(r.roundPoints, id, pts);
  for (const fight of r.fights ?? []) {
    const winner = fight.winnerId ? fighterOf(s, fight.winnerId)! : null;
    for (const [victim, by] of Object.entries(fight.koBy)) {
      if (fighterOf(s, by)?.stats.noodle) {
        const o = owner(victim);
        if (o) bumpStat(s.stats, o, "noodled");
      }
      const o = owner(by);
      if (o) bumpStat(s.stats, o, "fighterKos");
    }
    if (r.kind === "duel") {
      if (!winner) {
        for (const id of fight.fighters) {
          give(owner(id), DOODLE_POINTS.draw);
          s.records[id]!.draws += 1;
        }
      } else {
        give(owner(winner.id), DOODLE_POINTS.win + (fight.how === "ko" ? DOODLE_POINTS.knockout : 0));
        s.records[winner.id]!.wins += 1;
        for (const id of fight.fighters) if (id !== winner.id) s.records[id]!.losses += 1;
      }
    } else {
      fight.placing.forEach((id, i) => give(owner(id), DOODLE_POINTS.ffa[i] ?? 0));
      for (const by of Object.values(fight.koBy)) give(owner(by), DOODLE_POINTS.ffaKnockout);
      const champ = owner(fight.placing[0]!);
      if (champ) bumpStat(s.stats, champ, "ffaWins");
    }
    if (winner && winner.stats.arms === 0) {
      const o = owner(winner.id);
      if (o) bumpStat(s.stats, o, "armlessWins");
    }
  }
  const winners = new Set(
    (r.fights ?? []).flatMap((f) =>
      r.kind === "ffa" ? f.placing.slice(0, 1) : f.winnerId ? [f.winnerId] : [],
    ),
  );
  const drawn = new Set(
    (r.fights ?? []).filter((f) => f.winnerId === null && r.kind === "duel").flatMap((f) => f.fighters),
  );
  for (const [playerId, bet] of Object.entries(r.bets)) {
    if (s.left.includes(playerId)) continue;
    const delta = drawn.has(bet.targetId)
      ? 0
      : winners.has(bet.targetId)
        ? Math.round(bet.stake * (r.odds[bet.targetId] ?? 1))
        : -bet.stake;
    r.betResults[playerId] = delta;
    addPoints(r.roundPoints, playerId, delta);
    if (delta > 0) bumpStat(s.stats, playerId, "betWinnings", delta);
  }
  for (const [id, pts] of Object.entries(r.roundPoints)) addPoints(s.points, id, pts);
  const last = s.roundIndex + 1 >= s.rounds.length;
  setPhase(s, "results", now, last ? FINAL_RESULTS_SECONDS : RESULTS_SECONDS);
}

function endPhase(s: S, now: number): Step<S> {
  switch (s.phase) {
    case "draw":
      return startWeighIn(s, now);
    case "weighin":
      startBet(s, 0, now);
      return { state: s };
    case "bet":
      startFight(s, now);
      return { state: s };
    case "fight":
      settle(s, now);
      return { state: s };
    case "results": {
      if (s.roundIndex + 1 >= s.rounds.length) {
        // The last fight stays on screen at the end, so it keeps its frames.
        s.phase = "done";
        return { state: s };
      }
      // The round is over: keep who won, drop the frames.
      const r = current(s)!;
      r.fights = (r.fights ?? []).map((f) => ({ ...f, frames: [], events: [] }));
      startBet(s, s.roundIndex + 1, now);
      return { state: s };
    }
    default:
      return { state: s };
  }
}

function maybeAdvance(s: S, now: number): Step<S> {
  const here = active(s);
  if (s.phase === "draw" && here.every((p) => s.drawings[p.id])) return endPhase(s, now);
  if (s.phase === "bet" && here.every((p) => current(s)!.bets[p.id])) return endPhase(s, now);
  return { state: s };
}

function handleAction(s: S, playerId: PlayerId, action: DoodleChampionsAction, now: number): Step<S> {
  if (!active(s).some((p) => p.id === playerId)) return { state: s };
  if (action.type === "fighter") {
    if (s.phase !== "draw" || s.drawings[playerId]) return { state: s };
    s.drawings[playerId] = action.strokes;
    return maybeAdvance(s, now);
  }
  const r = current(s);
  if (s.phase !== "bet" || !r || !r.matches.some((m) => m.includes(action.targetId))) return { state: s };
  r.bets[playerId] = { targetId: action.targetId, stake: action.stake };
  return maybeAdvance(s, now);
}

/** A round's captions: Claude's three lines at the opening, the middle and the finish, or the stock ones. */
function captionsOf(s: S, fight: DoodleFight): Caption[] {
  const lines = s.commentary[fight.key];
  if (!lines?.length || !fight.frames.length) return fight.stock;
  const end = fight.frames.length - 1;
  const big = fight.events.find((e) => e.k === "crit" || e.k === "topple")?.t;
  const middle = big !== undefined && big > 10 && big < end - 10 ? big : Math.round(end / 2);
  return lines.map((text, i) => ({ t: [0, middle, end][i] ?? end, text }));
}

export const doodleChampions: GameDefinition<
  S,
  DoodleChampionsContent,
  DoodleChampionsAction,
  DoodleChampionsView
> = {
  id: "doodle-champions",
  title: "Doodle Champions",
  tagline: "Draw a fighter. Watch it fight. Bet on the chaos.",
  rules: [
    "Draw a fighter in parts: a body (required), then legs, arms and a weapon if you like. Colors are just for looks.",
    "Shapes make the stats: a big body is tough but slow, legs make it fast (no legs: it hops, rolls or slides), long arms reach further, more arms hit more often, and a big weapon hits hard but swings slowly.",
    "Fighters duel side by side for a few rounds: +150 for a win, +50 more for a knockout. Then everyone brawls in one free-for-all.",
    "Before each round, bet 25, 50 or 100 on any fighter. Win and it pays the odds; lose and you lose the stake.",
  ],
  categories: ["drawing"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 6,
  contentSchema: doodleChampionsContentSchema,
  actionSchema: doodleChampionsActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "doodle-champions", spice, count: 0, avoid }),
  contentIds: () => [],

  init({ players, seed, now, pace }): Step<S> {
    const s: S = {
      players,
      left: [],
      phase: "draw",
      phaseStartedAt: now,
      phaseEndsAt: 0,
      drawings: {},
      fighters: [],
      roundIndex: 0,
      rounds: [],
      commentary: {},
      commentator: "stock",
      records: {},
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    setPhase(s, "draw", now, DRAW_SECONDS);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return handleAction(s, event.playerId, event.action as DoodleChampionsAction, event.now);
      case "tick":
        return event.now >= deadline(s)! ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        return maybeAdvance(s, event.now);
      case "effect_result":
        if (event.effectId === NAME_EFFECT_ID) applyNames(s, event.result as NameFightersResult | null);
        return { state: s };
    }
  },

  view(s, viewer): DoodleChampionsView {
    const r = s.phase === "draw" || s.phase === "weighin" ? undefined : current(s);
    const revealed = s.phase === "results" || s.phase === "done";
    const fighting = s.phase === "fight" || revealed;
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      startedAt: s.phaseStartedAt,
      round: s.roundIndex,
      totalRounds: s.rounds.length || DUEL_ROUNDS + 1,
      kind: r?.kind ?? null,
      submittedIds: s.phase === "draw" ? Object.keys(s.drawings) : [],
      myDrawing: s.phase === "draw" && viewer ? (s.drawings[viewer] ?? null) : null,
      fighters:
        s.phase === "draw"
          ? []
          : s.fighters.map((f, i) => ({
              ...f,
              n: i + 1,
              record: s.records[f.id] ?? { wins: 0, losses: 0, draws: 0 },
            })),
      matches: r?.matches ?? [],
      odds: r?.odds ?? {},
      stakes: DOODLE_STAKES,
      bettedIds: r ? Object.keys(r.bets) : [],
      myBet: r && viewer ? (r.bets[viewer] ?? null) : null,
      bets:
        r && revealed
          ? Object.fromEntries(
              Object.entries(r.bets).map(([id, bet]) => [id, { ...bet, delta: r.betResults[id] ?? 0 }]),
            )
          : null,
      fights:
        r?.fights && fighting
          ? r.fights.map((f) => {
              const { stock: _stock, ...fight } = f;
              return { ...fight, captions: captionsOf(s, f) };
            })
          : null,
      roundPoints: r && revealed ? r.roundPoints : {},
      points: s.points,
      commentator: s.commentator,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  // Bets can lose points within the game, but nobody leaves it with less than they came in with.
  scores: (s) => Object.fromEntries(Object.entries(s.points).map(([id, pts]) => [id, Math.max(0, pts)])),
  stats: (s) => s.stats,
};
