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

/**
 * Brick Brawl: bricks on a shrinking grid. Each turn everyone secretly picks one move at the same time; the server
 * resolves them all at once and every screen replays the result. Being pushed off the edge knocks you out.
 */

const ROUNDS = 2;
const MAX_TURNS = 12;
/** The outer ring crumbles after every this many turns, down to a 3x3 arena. */
const SHRINK_EVERY = 3;
const PLAN_SECONDS = 12;
/** A round's first turn is longer, so people can read the moves (and the walkthrough) before the brawl starts. */
const FIRST_PLAN_SECONDS = 25;
const REPLAY_SECONDS = 4;
const RESULTS_SECONDS = 10;
/** How far a shove sends a brick, in tiles. */
const SHOVE_TILES = 2;

export const BRAWL_POINTS = {
  knockout: 150,
  /** For first, second and third place in a round. */
  placement: [300, 150, 75],
  hazardHit: 50,
} as const;

export const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
export type Direction = keyof typeof DIRECTIONS;
const directionSchema = z.enum(["up", "down", "left", "right"]);

export const brickBrawlContentSchema = z.object({});
export type BrickBrawlContent = z.infer<typeof brickBrawlContentSchema>;

export const brickBrawlActionSchema = z.discriminatedUnion("type", [
  /** One tile. */
  z.object({ type: z.literal("step"), dir: directionSchema }),
  /** Two tiles; running into a brick rams it one tile and stops you. */
  z.object({ type: z.literal("dash"), dir: directionSchema }),
  /** Pushes the brick next to you two tiles away. */
  z.object({ type: z.literal("shove"), dir: directionSchema }),
  /** Can't be shoved, rammed or hit this turn. */
  z.object({ type: z.literal("block") }),
  z.object({ type: z.literal("stay") }),
  /** Knocked-out players drop a brick on a tile: whoever stands there is dazed and skips their next move. */
  z.object({
    type: z.literal("drop"),
    x: z.number().int().min(0).max(20),
    y: z.number().int().min(0).max(20),
  }),
]);
export type BrickBrawlAction = z.infer<typeof brickBrawlActionSchema>;
export type BrawlMove = Exclude<BrickBrawlAction, { type: "drop" }>;

type Phase = "plan" | "replay" | "results" | "done";

export interface BrawlBrick {
  id: PlayerId;
  x: number;
  y: number;
  /** `null` while standing; otherwise the turn it fell. */
  outAt: number | null;
  /** Skips its next move, after a dropped brick hit it. */
  dazed: boolean;
}

/** What happened in a turn, in order, for the replay and the log. */
export type BrawlEvent =
  | { kind: "move"; id: PlayerId; to: [number, number] }
  | { kind: "bump"; id: PlayerId }
  | { kind: "block"; id: PlayerId }
  | { kind: "ram"; by: PlayerId; id: PlayerId }
  | { kind: "shove"; by: PlayerId; id: PlayerId }
  | { kind: "fall"; id: PlayerId; by: PlayerId[] }
  | { kind: "drop"; by: PlayerId; x: number; y: number; hit: PlayerId | null }
  | { kind: "shrink" };

export interface BrawlRound {
  size: number;
  /** Rings crumbled so far: tiles closer than this to the border are gone. */
  ring: number;
  turn: number;
  bricks: BrawlBrick[];
  /** This turn's secret choices. */
  moves: Record<PlayerId, BrawlMove>;
  drops: Record<PlayerId, { x: number; y: number }>;
  events: BrawlEvent[];
  roundPoints: Record<PlayerId, number>;
  /** Final order, best first, once the round is over. */
  placing: PlayerId[] | null;
}

export interface BrickBrawlState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  roundIndex: number;
  rounds: BrawlRound[];
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

export interface BrickBrawlView {
  phase: Phase;
  endsAt: number;
  round: number;
  totalRounds: number;
  turn: number;
  maxTurns: number;
  size: number;
  ring: number;
  /** Whether the outer ring crumbles at the end of this turn. */
  crumbles: boolean;
  bricks: BrawlBrick[];
  /** Who has locked in a move this turn (not what). */
  readyIds: PlayerId[];
  /** `null` for spectators. */
  myMove: BrawlMove | null;
  myDrop: { x: number; y: number } | null;
  /** The last turn's events, shown during the replay. */
  events: BrawlEvent[];
  placing: PlayerId[] | null;
  roundPoints: Record<PlayerId, number>;
  points: Record<PlayerId, number>;
}

type S = BrickBrawlState;
type Pos = [number, number];

const current = (s: S) => s.rounds[s.roundIndex]!;
const key = (x: number, y: number) => `${x},${y}`;
const standing = (r: BrawlRound) => r.bricks.filter((b) => b.outAt === null);

/** Whether a tile still exists. */
export function onArena(r: Pick<BrawlRound, "size" | "ring">, x: number, y: number): boolean {
  return x >= r.ring && y >= r.ring && x < r.size - r.ring && y < r.size - r.ring;
}

/** Whether the outer ring crumbles after `turn` (counting from 0). */
const crumblesAfter = (r: BrawlRound, turn: number) =>
  (turn + 1) % SHRINK_EVERY === 0 && r.size - 2 * r.ring > 3;

function arenaSize(players: number): number {
  if (players <= 4) return 7;
  if (players <= 8) return 9;
  return 11;
}

/** Spreads players around a ring one tile in from the edge, so nobody starts next to a drop. */
function startPositions(size: number, count: number): Pos[] {
  const lo = 1;
  const hi = size - 2;
  const ring: Pos[] = [];
  for (let x = lo; x <= hi; x++) ring.push([x, lo]);
  for (let y = lo + 1; y <= hi; y++) ring.push([hi, y]);
  for (let x = hi - 1; x >= lo; x--) ring.push([x, hi]);
  for (let y = hi - 1; y > lo; y--) ring.push([lo, y]);
  return Array.from({ length: count }, (_, i) => ring[Math.floor((i * ring.length) / count)]!);
}

function newRound(players: PlayerInfo[], seed: number): BrawlRound {
  const rng = createRng(seed);
  const size = arenaSize(players.length);
  const spots = startPositions(size, players.length);
  const order = rng.shuffle(players);
  return {
    size,
    ring: 0,
    turn: 0,
    bricks: order.map((p, i) => ({ id: p.id, x: spots[i]![0], y: spots[i]![1], outAt: null, dazed: false })),
    moves: {},
    drops: {},
    events: [],
    roundPoints: {},
    placing: null,
  };
}

const add = ([x, y]: Pos, [dx, dy]: readonly number[]): Pos => [x + dx!, y + dy!];

/**
 * Resolves one turn: moves first (steps, then each dash's second tile), then shoves, then dropped bricks, then the
 * arena crumbling. Everything that happens at the same moment happens to everyone at once, so the result never
 * depends on who chose first.
 */
export function resolveTurn(r: BrawlRound, stats: GameStats): BrawlEvent[] {
  const events: BrawlEvent[] = [];
  const bricks = new Map(standing(r).map((b) => [b.id, b]));
  const moves = new Map<PlayerId, BrawlMove>();
  for (const b of bricks.values()) {
    const move = b.dazed ? { type: "stay" as const } : (r.moves[b.id] ?? { type: "stay" as const });
    b.dazed = false;
    moves.set(b.id, move);
    if (move.type === "block") events.push({ kind: "block", id: b.id });
  }
  const blocking = (id: PlayerId) => moves.get(id)?.type === "block";
  /** Who pushed each brick this turn, to credit a knockout. */
  const pushedBy = new Map<PlayerId, Set<PlayerId>>();
  const credit = (id: PlayerId, by: PlayerId) => pushedBy.set(id, new Set([...(pushedBy.get(id) ?? []), by]));
  const fall = (b: BrawlBrick) => {
    b.outAt = r.turn;
    bricks.delete(b.id);
    const by = [...(pushedBy.get(b.id) ?? [])];
    events.push({ kind: "fall", id: b.id, by });
    for (const p of by) {
      addPoints(r.roundPoints, p, BRAWL_POINTS.knockout);
      bumpStat(stats, p, "knockouts");
    }
  };
  const at = () => new Map([...bricks.values()].map((b) => [key(b.x, b.y), b]));

  // Moves, in two beats: every mover takes its first tile, then dashers take their second.
  const dashing = new Set<PlayerId>();
  for (const beat of [0, 1]) {
    const movers = [...bricks.values()].filter((b) => {
      const m = moves.get(b.id)!;
      return beat === 0 ? m.type === "step" || m.type === "dash" : dashing.has(b.id);
    });
    if (beat === 0) for (const b of movers) if (moves.get(b.id)!.type === "dash") dashing.add(b.id);
    const target = new Map(
      movers.map((b) => [b.id, add([b.x, b.y], DIRECTIONS[(moves.get(b.id) as { dir: Direction }).dir])]),
    );
    const occupant = at();
    const blocked = new Set<PlayerId>();
    // Two bricks heading for the same tile both bounce off.
    const claims = new Map<string, PlayerId[]>();
    for (const [id, t] of target) claims.set(key(...t), [...(claims.get(key(...t)) ?? []), id]);
    for (const ids of claims.values()) if (ids.length > 1) ids.forEach((id) => blocked.add(id));
    // A brick can only move into a tile that's empty or being left; repeat until nothing changes.
    for (let changed = true; changed;) {
      changed = false;
      for (const [id, t] of target) {
        if (blocked.has(id)) continue;
        const there = occupant.get(key(...t));
        if (!there) continue;
        const leaving = target.has(there.id) && !blocked.has(there.id);
        const swap = leaving && key(...target.get(there.id)!) === key(bricks.get(id)!.x, bricks.get(id)!.y);
        if (!leaving || swap) {
          blocked.add(id);
          changed = true;
        }
      }
    }
    const rams: [BrawlBrick, BrawlBrick, Direction][] = [];
    for (const [id, t] of target) {
      const b = bricks.get(id)!;
      const dir = (moves.get(id) as { dir: Direction }).dir;
      if (blocked.has(id)) {
        dashing.delete(id);
        const there = occupant.get(key(...t));
        if (there && moves.get(id)!.type === "dash" && !target.has(there.id)) rams.push([b, there, dir]);
        else events.push({ kind: "bump", id });
        continue;
      }
      b.x = t[0];
      b.y = t[1];
      events.push({ kind: "move", id, to: t });
      if (!onArena(r, b.x, b.y)) {
        dashing.delete(id);
        fall(b);
      }
    }
    for (const [by, b, dir] of rams) {
      if (b.outAt !== null || blocking(b.id)) {
        events.push({ kind: "bump", id: by.id });
        continue;
      }
      const t = add([b.x, b.y], DIRECTIONS[dir]);
      events.push({ kind: "ram", by: by.id, id: b.id });
      if (at().has(key(...t))) continue;
      credit(b.id, by.id);
      b.x = t[0];
      b.y = t[1];
      events.push({ kind: "move", id: b.id, to: t });
      if (!onArena(r, b.x, b.y)) fall(b);
    }
  }

  // Shoves: every shove lands at once, and pushes add up (two shoves from the same side still send a brick 2 tiles).
  const pushes = new Map<PlayerId, [number, number]>();
  for (const b of bricks.values()) {
    const m = moves.get(b.id)!;
    if (m.type !== "shove") continue;
    bumpStat(stats, b.id, "shoves");
    const there = at().get(key(...add([b.x, b.y], DIRECTIONS[m.dir])));
    if (!there) continue;
    if (blocking(there.id)) {
      events.push({ kind: "shove", by: b.id, id: there.id });
      continue;
    }
    events.push({ kind: "shove", by: b.id, id: there.id });
    credit(there.id, b.id);
    const [dx, dy] = DIRECTIONS[m.dir];
    const v = pushes.get(there.id) ?? [0, 0];
    pushes.set(there.id, [v[0] + dx * SHOVE_TILES, v[1] + dy * SHOVE_TILES]);
  }
  const clamp = (n: number) => Math.max(-SHOVE_TILES, Math.min(SHOVE_TILES, n));
  const remaining = new Map([...pushes].map(([id, [x, y]]) => [id, [clamp(x), clamp(y)] as Pos]));
  for (let beat = 0; beat < SHOVE_TILES * 2 && remaining.size; beat++) {
    const occupant = at();
    const next = new Map<PlayerId, Pos>();
    for (const [id, [vx, vy]] of remaining) {
      const b = bricks.get(id);
      if (!b || (vx === 0 && vy === 0)) {
        remaining.delete(id);
        continue;
      }
      next.set(id, [b.x + Math.sign(vx), b.y + Math.sign(vy)]);
    }
    const claims = new Map<string, number>();
    for (const t of next.values()) claims.set(key(...t), (claims.get(key(...t)) ?? 0) + 1);
    for (const [id, t] of next) {
      const b = bricks.get(id)!;
      const there = occupant.get(key(...t));
      // A pushed brick stops at another brick, or where two pushed bricks meet.
      if ((there && !next.has(there.id)) || claims.get(key(...t))! > 1) {
        remaining.delete(id);
        continue;
      }
      const [vx, vy] = remaining.get(id)!;
      remaining.set(id, [vx - Math.sign(vx), vy - Math.sign(vy)]);
      b.x = t[0];
      b.y = t[1];
      events.push({ kind: "move", id, to: t });
      if (!onArena(r, b.x, b.y)) {
        remaining.delete(id);
        fall(b);
      }
    }
  }

  // Dropped bricks from knocked-out players.
  const occupant = at();
  for (const [by, { x, y }] of Object.entries(r.drops)) {
    const hit = occupant.get(key(x, y));
    const lands = hit && !blocking(hit.id) ? hit : null;
    events.push({ kind: "drop", by, x, y, hit: lands?.id ?? null });
    if (!lands) continue;
    lands.dazed = true;
    addPoints(r.roundPoints, by, BRAWL_POINTS.hazardHit);
    bumpStat(stats, by, "hazardHits");
  }

  // The outer ring crumbles, taking anyone on it.
  if (crumblesAfter(r, r.turn)) {
    r.ring += 1;
    events.push({ kind: "shrink" });
    for (const b of [...bricks.values()]) if (!onArena(r, b.x, b.y)) fall(b);
  }
  return events;
}

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  return s.phase === "plan" ? s.phaseEndsAt + GRACE_MS : s.phaseEndsAt;
}

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

/** Places everyone: standing bricks first, then by how long they lasted. */
function finishRound(s: S, now: number): Step<S> {
  const r = current(s);
  const lasted = (b: BrawlBrick) => (b.outAt === null ? Infinity : b.outAt);
  const order = [...r.bricks].sort((a, b) => lasted(b) - lasted(a));
  r.placing = order.map((b) => b.id);
  // Bricks standing together share the best place left.
  let place = 0;
  for (let i = 0; i < order.length; i++) {
    if (i > 0 && lasted(order[i]!) !== lasted(order[i - 1]!)) place = i;
    const pts = BRAWL_POINTS.placement[place];
    if (pts && !s.left.includes(order[i]!.id)) addPoints(r.roundPoints, order[i]!.id, pts);
  }
  const winners = order.filter((b) => b.outAt === null);
  if (winners.length === 1) bumpStat(s.stats, winners[0]!.id, "lastStanding");
  const first = [...r.bricks]
    .filter((b) => b.outAt !== null && !s.left.includes(b.id))
    .sort((a, b) => a.outAt! - b.outAt!)[0];
  if (first) bumpStat(s.stats, first.id, "firstOut");
  for (const [id, pts] of Object.entries(r.roundPoints)) addPoints(s.points, id, pts);
  setPhase(s, "results", now, RESULTS_SECONDS);
  return { state: s };
}

function endPhase(s: S, now: number): Step<S> {
  const r = current(s);
  switch (s.phase) {
    case "plan":
      r.events = resolveTurn(r, s.stats);
      r.moves = {};
      r.drops = {};
      setPhase(s, "replay", now, REPLAY_SECONDS);
      return { state: s };
    case "replay":
      if (standing(r).length <= 1 || r.turn + 1 >= MAX_TURNS) return finishRound(s, now);
      r.turn += 1;
      r.events = [];
      setPhase(s, "plan", now, PLAN_SECONDS);
      return { state: s };
    case "results":
      if (s.roundIndex + 1 >= s.rounds.length) {
        s.phase = "done";
        return { state: s };
      }
      s.roundIndex += 1;
      setPhase(s, "plan", now, FIRST_PLAN_SECONDS);
      return { state: s };
    default:
      return { state: s };
  }
}

/** Ends planning early once every standing player has picked a move. */
function maybeAdvance(s: S, now: number): Step<S> {
  const r = current(s);
  if (s.phase === "plan" && standing(r).every((b) => s.left.includes(b.id) || b.dazed || r.moves[b.id])) {
    return endPhase(s, now);
  }
  return { state: s };
}

function handleAction(s: S, playerId: PlayerId, action: BrickBrawlAction, now: number): Step<S> {
  if (s.phase !== "plan" || s.left.includes(playerId)) return { state: s };
  const r = current(s);
  const brick = r.bricks.find((b) => b.id === playerId);
  if (!brick) return { state: s };
  if (action.type === "drop") {
    if (brick.outAt === null || !onArena(r, action.x, action.y)) return { state: s };
    r.drops[playerId] = { x: action.x, y: action.y };
    return { state: s };
  }
  if (brick.outAt !== null || brick.dazed) return { state: s };
  r.moves[playerId] = action;
  return maybeAdvance(s, now);
}

export const brickBrawl: GameDefinition<S, BrickBrawlContent, BrickBrawlAction, BrickBrawlView> = {
  id: "brick-brawl",
  title: "Brick Brawl",
  tagline: "Shove your teammates off a crumbling arena. Nothing personal.",
  rules: [
    "Every turn, everyone secretly picks one move at the same time: step, dash two tiles, shove the brick next to you, or block.",
    "Everyone moves at once, then the shoves land, so step next to someone and you might get shoved. Shoved bricks fly two tiles; dash into a brick and you ram it one.",
    "Off the edge, you're out, and +150 goes to whoever pushed you. The edge crumbles every 3 turns.",
    "Knocked out? Drop bricks on the arena: a hit dazes a player for a turn. Last brick standing gets +300.",
  ],
  categories: ["action"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 6,
  contentSchema: brickBrawlContentSchema,
  actionSchema: brickBrawlActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "brick-brawl", spice, count: 0, avoid }),
  contentIds: () => [],

  init({ players, seed, now, pace }): Step<S> {
    const s: S = {
      players,
      left: [],
      phase: "plan",
      phaseEndsAt: 0,
      roundIndex: 0,
      rounds: Array.from({ length: ROUNDS }, (_, i) =>
        newRound(players, (seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0),
      ),
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    setPhase(s, "plan", now, FIRST_PLAN_SECONDS);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return handleAction(s, event.playerId, event.action as BrickBrawlAction, event.now);
      case "tick":
        return event.now >= deadline(s)! ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left": {
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        // A player who leaves falls off at once, with nobody to credit.
        for (const r of s.rounds) {
          const b = r.bricks.find((x) => x.id === event.playerId);
          if (b && b.outAt === null) b.outAt = r === current(s) ? r.turn : -1;
        }
        return maybeAdvance(s, event.now);
      }
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): BrickBrawlView {
    const r = current(s);
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.roundIndex,
      totalRounds: s.rounds.length,
      turn: r.turn,
      maxTurns: MAX_TURNS,
      size: r.size,
      ring: r.ring,
      crumbles: s.phase === "plan" && crumblesAfter(r, r.turn),
      bricks: r.bricks,
      readyIds: Object.keys(r.moves),
      myMove: viewer ? (r.moves[viewer] ?? null) : null,
      myDrop: viewer ? (r.drops[viewer] ?? null) : null,
      events: r.events,
      placing: r.placing,
      roundPoints: r.roundPoints,
      points: s.points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
