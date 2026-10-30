import { z } from "zod";
import {
  GRACE_MS,
  addPoints,
  bumpStat,
  seconds,
  zeroPoints,
  type GameDefinition,
  type GameEvent,
  type Step,
} from "../engine";
import { createRng } from "../rng";
import type { GameStats, PlayerId, PlayerInfo } from "../types";
import {
  DOODLE_LIMITS,
  fighterRig,
  fighterStats,
  randomFighterShapes,
  shapesToFighter,
  stockName,
  type FighterRig,
  type FighterStats,
} from "./doodle-fighter";
import { strokeSchema, type Stroke } from "./skip-logic";
import {
  GO_TICK,
  KEY_MASK,
  SMASH_TICK_MS,
  applyInput,
  fightPlacing,
  mix,
  newFight,
  packBody,
  packShot,
  pickStage,
  smashBot,
  smashSpec,
  stepFight,
  unpackBody,
  unpackShot,
  type SmashBody,
  type SmashEvent,
  type SmashFight,
  type SmashItem,
  type SmashSight,
  type SmashSpec,
  type SmashTally,
  type StageId,
  type WeaponKind,
} from "./smash-sim";

/**
 * Doodle Smash: everyone draws a fighter part by part, as in Doodle Champions, and picks whether its weapon is a Blade
 * or a Blaster. After a short weigh-in, every fighter brawls at once on a random stage, played live (DECISION-19): the
 * room ticks the fight at a fixed rate, players send the keys they hold, and the server decides everything
 * (smash-sim.ts). Points for placing and for every KO.
 */

const DRAW_SECONDS = 90;
const WEIGH_IN_SECONDS = 12;
/** The time limit, after the "3, 2, 1". */
const FIGHT_SECONDS = 150;
/** Time after the last fighter standing is decided, for the finish to land. */
const OVER_SECONDS = 2.5;
const RESULTS_SECONDS = 12;
/** A tick event steps the fight at most this many ticks; a room that fell further behind skips the rest. */
const MAX_CATCH_UP = 8;
/**
 * During the fight, players' views carry the drawings for the countdown and then only when that player's screen asks
 * (`drawings` action: it joined late or reloaded), since drawings can weigh 150 KB. Spectators, who can't ask, get them
 * for a moment every `DRAWINGS_EVERY` ticks.
 */
const DRAWINGS_EVERY = 400;
/** Ticks a view keeps carrying drawings after a screen asks: a few updates' worth. */
const DRAWINGS_ASKED_TICKS = 6;
/** The fighters' names and specs come every `ROSTER_EVERY` ticks, for the same reason. */
const ROSTER_EVERY = 20;
/** Ticks a view carries those for: longer than the gap between two updates. */
const CARRY_WINDOW = 3;
/** Views carry the events of this many ticks; screens play each once. */
const EVENT_TICKS = 12;

export const SMASH_POINTS = {
  /** First, second and third. */
  place: [300, 150, 75],
  ko: 50,
} as const;

export const SMASH_WEAPONS = ["blade", "blaster"] as const;

const fighterSchema = z
  .array(strokeSchema)
  .min(1)
  .max(DOODLE_LIMITS.maxStrokes)
  .refine(
    (strokes) => strokes.reduce((n, s) => n + s.p.length, 0) <= DOODLE_LIMITS.maxValues,
    "Fighter too detailed",
  );

export const doodleSmashContentSchema = z.object({});
export type DoodleSmashContent = z.infer<typeof doodleSmashContentSchema>;

export const doodleSmashActionSchema = z.discriminatedUnion("type", [
  /** Your fighter, drawn in parts (each stroke's `t`), and what its weapon is. Left out, a blade. */
  z.object({
    type: z.literal("fighter"),
    strokes: fighterSchema,
    weapon: z.enum(SMASH_WEAPONS).default("blade"),
  }),
  /**
   * The keys you hold during the fight (`KEY` bits), and the attack key going down or up. Sent when they change, so
   * a press is never lost however short; `seq` counts up, and your fighter's `ack` says which one the server has seen.
   */
  /** This screen is missing the drawings (it joined late or reloaded): carry them in its next views. */
  z.object({ type: z.literal("drawings") }),
  z.object({
    type: z.literal("input"),
    held: z.number().int().min(0).max(KEY_MASK),
    attack: z.enum(["press", "release"]).nullable().optional(),
    seq: z.number().int().min(0).max(1e9),
  }),
]);
export type DoodleSmashAction = z.infer<typeof doodleSmashActionSchema>;

type Phase = "draw" | "weighin" | "fight" | "results" | "done";

export interface SmashFighter {
  /** The owner's player id. */
  id: PlayerId;
  strokes: Stroke[];
  rig: FighterRig;
  stats: FighterStats;
  weapon: WeaponKind;
  spec: SmashSpec;
  name: string;
  /** Drawn by the game because its owner ran out of time. */
  auto: boolean;
}

export interface DoodleSmashState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  drawings: Record<PlayerId, { strokes: Stroke[]; weapon: WeaponKind }>;
  /** In fight order: fighter i is the fight's body i. */
  fighters: SmashFighter[];
  /** Each fighter's spec, in fight order, kept apart so a tick doesn't rebuild it. */
  cast: SmashSpec[];
  stage: StageId | null;
  fight: SmashFight | null;
  /** When the fight's tick 0 was, on the match clock. */
  fightStartedAt: number;
  /** Players whose screens asked for the drawings, until which fight tick their views carry them. */
  drawingsFor?: Record<PlayerId, number>;
  /** Player ids best first, once the fight is over. */
  placing: PlayerId[] | null;
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

/** A fighter as screens get it: its drawing only when the view carries drawings. */
export interface SmashFighterView {
  id: PlayerId;
  name: string;
  weapon: WeaponKind;
  spec: SmashSpec;
  auto: boolean;
  strokes?: Stroke[];
  rig?: FighterRig;
  stats?: FighterStats;
}

export interface SmashFightView {
  tick: number;
  stage: StageId;
  seed: number;
  over: number;
  /** Every fighter, packed (`packBody`). */
  bodies: number[][];
  /** The viewer's own fighter in full, so their screen can move it at once. */
  mine: SmashBody | null;
  /** Packed (`packShot`). */
  shots: number[][];
  items: SmashItem[];
  /** The last moment's events; screens play each once, by `n`. */
  events: SmashEvent[];
  outOrder: number[];
  /** Counters per fighter, once the fight is decided. */
  tally: SmashTally[] | null;
}

/** A fight view unpacked, as a bot or a screen reasons about it: the viewer's own fighter (`me`) in full. */
export function fightSight(v: SmashFightView, me = -1): SmashSight {
  const bodies = v.bodies.map(unpackBody);
  if (me >= 0 && v.mine && bodies[me]) bodies[me] = v.mine;
  return {
    tick: v.tick,
    stage: v.stage,
    seed: v.seed,
    bodies,
    shots: v.shots.map(unpackShot),
    items: v.items,
  };
}

export interface DoodleSmashView {
  phase: Phase;
  endsAt: number;
  startedAt: number;
  /** Who has handed in a fighter, during the draw. */
  submittedIds: PlayerId[];
  /** Your own fighter as you handed it in, during the draw. */
  myDrawing: { strokes: Stroke[]; weapon: WeaponKind } | null;
  stage: StageId | null;
  /**
   * Every fighter in fight order. During the fight, only now and then (screens keep them by `drawingsVersion`), and
   * empty in between.
   */
  fighters: SmashFighterView[];
  /** Every fighter's id (its owner's player id), in fight order, in every view. */
  order: PlayerId[];
  /** Whether `fighters` carry their drawings in this view. */
  withDrawings: boolean;
  /** Changes with every game's set of drawings, so screens can keep them between views. */
  drawingsVersion: number;
  fight: SmashFightView | null;
  /** When the fight's tick 0 was (match clock). */
  fightStartedAt: number;
  /** Your fighter's index in the fight, or -1. */
  me: number;
  placing: PlayerId[] | null;
  points: Record<PlayerId, number>;
}

type S = DoodleSmashState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  return s.phase === "draw" ? s.phaseEndsAt + GRACE_MS : s.phaseEndsAt;
}

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseStartedAt = now;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

/** A fighter from a drawing: its rig, stats, fight spec and a stock name. */
function makeFighter(
  id: PlayerId,
  strokes: Stroke[],
  weapon: WeaponKind,
  seed: number,
  auto: boolean,
): SmashFighter {
  const rig = fighterRig(strokes);
  const stats = fighterStats(strokes, rig);
  return {
    id,
    strokes,
    rig,
    stats,
    weapon,
    spec: smashSpec(stats, rig, weapon),
    name: stockName(stats, strokes, seed),
    auto,
  };
}

/** A random fighter and weapon, for players who ran out of time and for bots. */
export function randomSmashFighter(random: () => number): { strokes: Stroke[]; weapon: WeaponKind } {
  const strokes = shapesToFighter(randomFighterShapes(random), random);
  return { strokes, weapon: random() < 0.5 ? "blade" : "blaster" };
}

function startWeighIn(s: S, now: number) {
  const rng = createRng(mix(s.seed, 0x5a4a5));
  const fighters: SmashFighter[] = [];
  s.players.forEach((p, i) => {
    let drawing = s.drawings[p.id];
    let auto = false;
    if (!drawing?.strokes.length) {
      if (s.left.includes(p.id)) return;
      drawing = randomSmashFighter(rng.next);
      auto = true;
    }
    fighters.push(makeFighter(p.id, drawing.strokes, drawing.weapon, mix(s.seed, i), auto));
  });
  // Two stock names alike get a number.
  const seen = new Map<string, number>();
  for (const f of fighters) {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    if (n > 1) f.name = `${f.name.slice(0, 20)} ${["", "", "II", "III", "IV"][n] ?? n}`.trim();
  }
  s.fighters = fighters;
  s.cast = fighters.map((f) => f.spec);
  s.drawings = {};
  if (fighters.length < 2) {
    s.phase = "done";
    return;
  }
  s.stage = pickStage(s.seed);
  setPhase(s, "weighin", now, WEIGH_IN_SECONDS);
}

function startFight(s: S, now: number) {
  s.fight = newFight(s.stage!, s.fighters.length, mix(s.seed, 0xf16));
  s.fightStartedAt = now;
  // The countdown is real time whatever the pace; only the time limit follows it.
  s.phase = "fight";
  s.phaseStartedAt = now;
  s.phaseMs = seconds(s.pace, FIGHT_SECONDS);
  s.phaseEndsAt = now + GO_TICK * SMASH_TICK_MS + s.phaseMs;
  // A fighter whose owner left before the bell sits the fight out.
  s.fighters.forEach((f, i) => {
    if (s.left.includes(f.id)) knockOutForGood(s.fight!, i);
  });
}

function knockOutForGood(f: SmashFight, i: number) {
  const b = f.bodies[i]!;
  if (b.lives <= 0) return;
  b.lives = 0;
  b.out = -1;
  f.outOrder.push(i);
}

/** Points by placing and KOs, and the stats behind the awards. */
function settle(s: S, now: number) {
  const f = s.fight;
  s.placing = f ? fightPlacing(f).map((i) => s.fighters[i]!.id) : s.fighters.map((x) => x.id);
  const here = (id: PlayerId) => !s.left.includes(id);
  s.placing.forEach((id, rank) => {
    if (here(id)) addPoints(s.points, id, SMASH_POINTS.place[rank] ?? 0);
  });
  if (f) {
    f.tally.forEach((t, i) => {
      const id = s.fighters[i]!.id;
      if (!here(id)) return;
      if (t.kos) {
        addPoints(s.points, id, t.kos * SMASH_POINTS.ko);
        bumpStat(s.stats, id, "smashKos", t.kos);
      }
      if (t.selfKos) bumpStat(s.stats, id, "smashSelfKos", t.selfKos);
      if (t.powerUps) bumpStat(s.stats, id, "smashPowerUps", t.powerUps);
      if (t.comebacks) bumpStat(s.stats, id, "smashComebacks", t.comebacks);
    });
  }
  setPhase(s, "results", now, RESULTS_SECONDS);
}

function endPhase(s: S, now: number): Step<S> {
  switch (s.phase) {
    case "draw":
      startWeighIn(s, now);
      break;
    case "weighin":
      startFight(s, now);
      break;
    case "fight":
      settle(s, now);
      break;
    case "results":
      s.phase = "done";
      break;
  }
  return { state: s };
}

function maybeAdvance(s: S, now: number): Step<S> {
  if (s.phase === "draw" && active(s).every((p) => s.drawings[p.id])) return endPhase(s, now);
  return { state: s };
}

/**
 * The fight's own steps, which come many times a second: they copy only what changes (the fight), never the
 * drawings, so a tick stays cheap.
 */
function fightStep(s: S, event: Extract<GameEvent, { type: "tick" | "action" }>): Step<S> | null {
  const fight = s.fight;
  if (!fight) return null;
  if (event.type === "action") {
    const action = event.action as DoodleSmashAction;
    if (action.type === "drawings") {
      if (!s.fighters.some((f) => f.id === event.playerId)) return { state: s };
      return { state: { ...s, drawingsFor: { ...s.drawingsFor, [event.playerId]: fight.tick + DRAWINGS_ASKED_TICKS } } };
    }
    if (action.type !== "input") return { state: s };
    const i = s.fighters.findIndex((f) => f.id === event.playerId);
    if (i < 0 || s.left.includes(event.playerId)) return { state: s };
    const bodies = fight.bodies.slice();
    const body = { ...bodies[i]! };
    applyInput(body, action.held, action.attack, action.seq);
    bodies[i] = body;
    return { state: { ...s, fight: { ...fight, bodies } } };
  }
  if (event.now >= s.phaseEndsAt) return null;
  let startedAt = s.fightStartedAt;
  let behind = Math.floor((event.now - startedAt) / SMASH_TICK_MS) - fight.tick;
  if (behind <= 0) return { state: s };
  if (behind > MAX_CATCH_UP) {
    startedAt += (behind - MAX_CATCH_UP) * SMASH_TICK_MS;
    behind = MAX_CATCH_UP;
  }
  let f = fight;
  for (let k = 0; k < behind; k++) f = stepFight(f, s.cast);
  let endsAt = s.phaseEndsAt;
  if (f.over >= 0 && fight.over < 0) endsAt = Math.min(endsAt, event.now + OVER_SECONDS * 1000);
  return { state: { ...s, fight: f, fightStartedAt: startedAt, phaseEndsAt: endsAt } };
}

function handleAction(s: S, playerId: PlayerId, action: DoodleSmashAction, now: number): Step<S> {
  if (!active(s).some((p) => p.id === playerId)) return { state: s };
  if (action.type === "fighter") {
    if (s.phase !== "draw" || s.drawings[playerId]) return { state: s };
    s.drawings[playerId] = { strokes: action.strokes, weapon: action.weapon ?? "blade" };
    return maybeAdvance(s, now);
  }
  return { state: s };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A body for the viewer's own view: positions to a tenth of a unit, so updates stay small. */
function bodyView(b: SmashBody): SmashBody {
  return { ...b, x: round1(b.x), y: round1(b.y), vx: round2(b.vx), vy: round2(b.vy), wear: round2(b.wear) };
}

/** Whether a view of `s` carries something that comes every `every` ticks during the fight, and always otherwise. */
function carries(s: S, every: number): boolean {
  if (s.phase === "draw") return false;
  if (s.phase !== "fight" || !s.fight) return true;
  const t = s.fight.tick;
  return t < GO_TICK || t % every < CARRY_WINDOW;
}

function fightView(s: S, f: SmashFight, me: number): SmashFightView {
  const decided = s.phase !== "fight" || f.over >= 0;
  return {
    tick: f.tick,
    stage: f.stage,
    seed: f.seed,
    over: f.over,
    bodies: f.bodies.map(packBody),
    mine: me >= 0 && f.bodies[me] ? bodyView(f.bodies[me]) : null,
    shots: f.shots.map(packShot),
    items: f.items,
    events: f.events.filter((e) => e.t > f.tick - EVENT_TICKS),
    outOrder: f.outOrder,
    tally: decided ? f.tally : null,
  };
}

export const doodleSmash: GameDefinition<S, DoodleSmashContent, DoodleSmashAction, DoodleSmashView> = {
  id: "doodle-smash",
  title: "Doodle Smash",
  tagline: "Draw a fighter. Then fight with it, live, everyone at once.",
  rules: [
    "Draw a fighter in parts: a body (required), then legs, arms and a weapon if you like. On the Weapon tab, pick a Blade (hits up close) or a Blaster (shoots ahead). Shapes set the stats: a big body is heavy, long legs run and jump better, long arms and weapons reach further.",
    "Everyone fights at once on a random stage. Arrow keys run, jump (twice more in the air, to fly back after a hit) and drop through ledges. Space attacks the way you hold the arrows; hold Space to charge a boosted hit. On a phone, use the buttons.",
    "B or Shift shields, but each block in a row lets more through, and a broken shield leaves you dizzy. Hits raise your damage %: the higher it is, the further you fly.",
    "Fly past the edges and you lose one of your 3 lives. Grab power-ups: a heart heals, a bolt speeds you up, a burst makes your next hit big, a shield blocks hits. Last one standing, or the best at the bell, wins: +300, +150 and +75 for the top three, +50 per KO.",
  ],
  categories: ["drawing", "action"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 5,
  contentSchema: doodleSmashContentSchema,
  actionSchema: doodleSmashActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "doodle-smash", spice, count: 0, avoid }),
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
      cast: [],
      stage: null,
      fight: null,
      fightStartedAt: 0,
      placing: null,
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    setPhase(s, "draw", now, DRAW_SECONDS);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    if (state.phase === "done") return { state };
    if (state.phase === "fight" && (event.type === "tick" || event.type === "action")) {
      const step = fightStep(state, event);
      if (step) return step;
    }
    const s = structuredClone(state);
    switch (event.type) {
      case "action":
        return handleAction(s, event.playerId, event.action as DoodleSmashAction, event.now);
      case "tick":
        return event.now >= deadline(s)! ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        if (s.fight) {
          const i = s.fighters.findIndex((f) => f.id === event.playerId);
          if (i >= 0) knockOutForGood(s.fight, i);
        }
        return maybeAdvance(s, event.now);
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): DoodleSmashView {
    const asked = viewer !== null && !!s.fight && (s.drawingsFor?.[viewer] ?? -1) >= s.fight.tick;
    const drawings = asked || (viewer === null ? carries(s, DRAWINGS_EVERY) : carries(s, Infinity));
    const roster = drawings || carries(s, ROSTER_EVERY);
    const me = viewer ? s.fighters.findIndex((f) => f.id === viewer) : -1;
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      startedAt: s.phaseStartedAt,
      submittedIds: s.phase === "draw" ? Object.keys(s.drawings) : [],
      myDrawing: s.phase === "draw" && viewer ? (s.drawings[viewer] ?? null) : null,
      stage: s.stage,
      fighters: (roster ? s.fighters : []).map((f) => ({
        id: f.id,
        name: f.name,
        weapon: f.weapon,
        spec: f.spec,
        auto: f.auto,
        ...(drawings ? { strokes: f.strokes, rig: f.rig, stats: f.stats } : {}),
      })),
      order: s.fighters.map((f) => f.id),
      withDrawings: drawings && s.fighters.length > 0,
      drawingsVersion: s.fighters.length ? mix(s.seed, s.fighters.length) : 0,
      fight: s.fight ? fightView(s, s.fight, me) : null,
      fightStartedAt: s.fightStartedAt,
      me,
      placing: s.placing,
      points: s.points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,

  live: (s) => (s.phase === "fight" ? { tickMs: SMASH_TICK_MS } : null),

  botInput(s, playerId) {
    const f = s.fight;
    if (s.phase !== "fight" || !f) return null;
    const i = s.fighters.findIndex((x) => x.id === playerId);
    const b = f.bodies[i];
    if (!b || b.out !== 0) return null;
    const want = smashBot(f, s.cast, i);
    if (want.held === b.held && want.attack === b.atkHeld) return null;
    return {
      type: "input",
      held: want.held,
      attack: want.attack === b.atkHeld ? null : want.attack ? "press" : "release",
      seq: b.ack + 1,
    };
  },
};
