import { z } from "zod";
import {
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
 * Paint Grab: a short real-time game with no words. Everyone paints one shared grid in their own colour at the same
 * time, painting over each other. Closing a loop of your colour fills everything inside it (like Skip Logic's bucket).
 * The most canvas when the clock runs out wins.
 *
 * Clients paint optimistically and send the cells they crossed in batches about five times a second. The server owns
 * the grid: it checks each batch (inside the grid, one cell at a time, no faster than the brush's ink allows), paints
 * it, fills closed loops and counts areas, so network delay only decides small ties.
 */

export const PAINT_W = 48;
export const PAINT_H = 32;
export const PAINT_CELLS = PAINT_W * PAINT_H;
/** One character per player in the grid string, by seat (12 players at most); `.` is bare canvas. */
export const PAINT_CODES = "ABCDEFGHIJKL";
export const PAINT_EMPTY = ".";
/** How often clients send what they painted. */
export const PAINT_BATCH_MS = 200;
/** Cells and strokes one batch may carry. */
export const PAINT_MAX_CELLS = 64;
export const PAINT_MAX_STROKES = 8;

/**
 * The brush's ink: every cell the brush moves onto costs one, and putting the brush down somewhere new costs
 * `strokeCost`. Ink refills at `perSecond` up to `max`. Clients hold their brush to `max`; the server allows `slack`
 * more, so batches bunched up by the network still go through. It's the speed limit that keeps scripts honest.
 */
export const PAINT_INK = { perSecond: 36, max: 48, slack: 16, strokeCost: 3 } as const;

/** A paint pot appears this long into a round, and again this long after one is grabbed. */
const POT_FIRST_SECONDS = 6;
const POT_AGAIN_SECONDS = 5;
/** Painting within this many cells of the pot grabs it, and it splats a disc this wide. */
const POT_REACH = 1;
export const PAINT_POT_RADIUS = 3.2;

const ROUNDS = 2;
const READY_SECONDS = 3;
const PAINT_SECONDS = 45;
const REVEAL_SECONDS = 8;
const RESULTS_SECONDS = 10;
const EVENTS_KEPT = 12;

export const PAINT_GRAB_POINTS = {
  /** For the most canvas, the second most and the third most in a round. Ties share the higher place. */
  place: [200, 100, 50],
  /** For every whole percent of the canvas you own when a round ends. */
  perPercent: 3,
} as const;

export const paintGrabContentSchema = z.object({});
export type PaintGrabContent = z.infer<typeof paintGrabContentSchema>;

const cell = z
  .number()
  .int()
  .min(0)
  .max(PAINT_CELLS - 1);
export const paintGrabActionSchema = z.discriminatedUnion("type", [
  /**
   * The cells the brush crossed since the last batch, as strokes of neighbouring cells. The first stroke carries on
   * from where the brush last was if it starts next to it; any other stroke puts the brush down somewhere new.
   */
  z.object({
    type: z.literal("paint"),
    strokes: z
      .array(z.array(cell).min(1).max(PAINT_MAX_CELLS))
      .min(1)
      .max(PAINT_MAX_STROKES)
      .refine((s) => s.reduce((n, stroke) => n + stroke.length, 0) <= PAINT_MAX_CELLS, "too many cells"),
  }),
]);
export type PaintGrabAction = z.infer<typeof paintGrabActionSchema>;

type Phase = "ready" | "paint" | "reveal" | "results" | "done";

/** Something worth a splash on screen: a loop closed, or a pot grabbed. `x`/`y` is its middle, in cells. */
export interface PaintEvent {
  n: number;
  kind: "fill" | "pot";
  playerId: PlayerId;
  x: number;
  y: number;
  /** Cells it painted. */
  cells: number;
}

export interface PaintPen {
  /** The cell the brush last painted, or `null` before the first stroke of the round. */
  last: number | null;
  ink: number;
  /** When the ink was last topped up (match clock). */
  at: number;
  /** Batches taken this round. */
  strokes: number;
}

export interface PaintRoundResult {
  counts: Record<PlayerId, number>;
  /** Best first. */
  placing: PlayerId[];
  points: Record<PlayerId, number>;
}

export interface PaintGrabState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  round: number;
  /** One character per cell, row by row: a `PAINT_CODES` letter (the player's seat) or `.`. */
  grid: string;
  pens: Record<PlayerId, PaintPen>;
  /** The paint pot's cell, or `null` when there's none on the canvas. */
  pot: number | null;
  /** When the next pot appears, while there's none. */
  potAt: number;
  potsSpawned: number;
  events: PaintEvent[];
  eventSeq: number;
  rounds: PaintRoundResult[];
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

export interface PaintGrabView {
  phase: Phase;
  endsAt: number;
  round: number;
  totalRounds: number;
  width: number;
  height: number;
  grid: string;
  /** Who each grid letter is: `order[i]` paints `PAINT_CODES[i]`. */
  order: PlayerId[];
  counts: Record<PlayerId, number>;
  pot: number | null;
  /** The latest fills and pot splats, oldest first. */
  events: PaintEvent[];
  /** Your brush, or `null` for spectators. */
  me: { last: number | null; at: number; strokes: number } | null;
  /** Every round finished so far. The last one is on screen during the reveal. */
  rounds: PaintRoundResult[];
  points: Record<PlayerId, number>;
}

type S = PaintGrabState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));
const xy = (c: number): [number, number] => [c % PAINT_W, Math.floor(c / PAINT_W)];
const at = (x: number, y: number) => y * PAINT_W + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < PAINT_W && y < PAINT_H;
/** Whether two cells share a side (or are the same cell). */
export function paintTouches(a: number, b: number): boolean {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.abs(ax - bx) + Math.abs(ay - by) <= 1;
}

/** The next cell on the way from `from` to `to`, one side at a time (along the longer gap first). */
export function paintStepToward(from: number, to: number): number {
  const [fx, fy] = xy(from);
  const [tx, ty] = xy(to);
  const dx = tx - fx;
  const dy = ty - fy;
  if (!dx && !dy) return from;
  return Math.abs(dx) >= Math.abs(dy) ? at(fx + Math.sign(dx), fy) : at(fx, fy + Math.sign(dy));
}

/** How many cells each player owns. */
export function paintCounts(grid: string, order: PlayerId[]): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = Object.fromEntries(order.map((id) => [id, 0]));
  for (let i = 0; i < grid.length; i++) {
    const id = order[PAINT_CODES.indexOf(grid[i]!)];
    if (id !== undefined) counts[id]! += 1;
  }
  return counts;
}

/**
 * The cells a loop of `code` closes off: areas of other cells that can't reach the canvas edge without crossing
 * `code`, counting only areas that touch one of `fresh` (the cells just painted). The edge isn't a wall, so only a
 * real loop fills.
 */
export function paintEnclosed(grid: string[], code: string, fresh: Iterable<number>): number[] {
  const open = new Uint8Array(PAINT_CELLS);
  const queue: number[] = [];
  const visit = (c: number) => {
    if (open[c] || grid[c] === code) return;
    open[c] = 1;
    queue.push(c);
  };
  for (let x = 0; x < PAINT_W; x++) (visit(at(x, 0)), visit(at(x, PAINT_H - 1)));
  for (let y = 0; y < PAINT_H; y++) (visit(at(0, y)), visit(at(PAINT_W - 1, y)));
  const spread = (c: number, each: (n: number) => void) => {
    const [x, y] = xy(c);
    if (x > 0) each(c - 1);
    if (x < PAINT_W - 1) each(c + 1);
    if (y > 0) each(c - PAINT_W);
    if (y < PAINT_H - 1) each(c + PAINT_W);
  };
  for (let i = 0; i < queue.length; i++) spread(queue[i]!, visit);

  // What's left are closed-off areas. Keep the ones this batch closed: those next to a fresh cell.
  const taken: number[] = [];
  const done = new Uint8Array(PAINT_CELLS);
  for (const f of fresh) {
    spread(f, (start) => {
      if (open[start] || done[start] || grid[start] === code) return;
      const area = [start];
      done[start] = 1;
      for (let i = 0; i < area.length; i++) {
        spread(area[i]!, (n) => {
          if (open[n] || done[n] || grid[n] === code) return;
          done[n] = 1;
          area.push(n);
        });
      }
      taken.push(...area);
    });
  }
  return taken;
}

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

function emptyPens(s: S, now: number): Record<PlayerId, PaintPen> {
  const full = PAINT_INK.max + PAINT_INK.slack;
  return Object.fromEntries(active(s).map((p) => [p.id, { last: null, ink: full, at: now, strokes: 0 }]));
}

function newRound(s: S, now: number) {
  s.grid = PAINT_EMPTY.repeat(PAINT_CELLS);
  s.pot = null;
  s.potsSpawned = 0;
  s.events = [];
  s.pens = emptyPens(s, now);
  setPhase(s, "ready", now, READY_SECONDS);
}

function event(s: S, kind: PaintEvent["kind"], playerId: PlayerId, cells: number[]) {
  if (!cells.length) return;
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    const [x, y] = xy(c);
    sx += x;
    sy += y;
  }
  s.eventSeq += 1;
  s.events.push({
    n: s.eventSeq,
    kind,
    playerId,
    x: sx / cells.length,
    y: sy / cells.length,
    cells: cells.length,
  });
  if (s.events.length > EVENTS_KEPT) s.events.splice(0, s.events.length - EVENTS_KEPT);
}

function spawnPot(s: S) {
  const rng = createRng((s.seed ^ Math.imul(s.round * 64 + s.potsSpawned + 1, 0x9e3779b1)) >>> 0);
  // Away from the edge, so the whole splat lands on the canvas.
  const margin = Math.ceil(PAINT_POT_RADIUS);
  s.pot = at(margin + rng.int(PAINT_W - 2 * margin), margin + rng.int(PAINT_H - 2 * margin));
  s.potsSpawned += 1;
}

function scoreRound(s: S) {
  const order = s.players.map((p) => p.id);
  const all = paintCounts(s.grid, order);
  const here = active(s).map((p) => p.id);
  const counts = Object.fromEntries(here.map((id) => [id, all[id] ?? 0]));
  const placing = [...here].sort((a, b) => counts[b]! - counts[a]! || order.indexOf(a) - order.indexOf(b));
  const points: Record<PlayerId, number> = {};
  for (const id of here) {
    const n = counts[id]!;
    // Ties share the higher place.
    const place = here.filter((other) => counts[other]! > n).length;
    const share = Math.floor((n * 100) / PAINT_CELLS);
    points[id] = n ? (PAINT_GRAB_POINTS.place[place] ?? 0) + share * PAINT_GRAB_POINTS.perPercent : 0;
    addPoints(s.points, id, points[id]!);
  }
  if (placing[0] && counts[placing[0]]) bumpStat(s.stats, placing[0], "paintRoundsWon");
  s.rounds.push({ counts, placing, points });
}

function endPhase(s: S, now: number): Step<S> {
  switch (s.phase) {
    case "ready":
      setPhase(s, "paint", now, PAINT_SECONDS);
      s.pens = emptyPens(s, now);
      s.potAt = now + seconds(s.pace, POT_FIRST_SECONDS);
      return { state: s };
    case "paint":
      s.pot = null;
      scoreRound(s);
      setPhase(s, "reveal", now, REVEAL_SECONDS);
      return { state: s };
    case "reveal":
      if (s.round + 1 < ROUNDS) {
        s.round += 1;
        newRound(s, now);
      } else setPhase(s, "results", now, RESULTS_SECONDS);
      return { state: s };
    case "results":
      s.phase = "done";
      return { state: s };
    default:
      return { state: s };
  }
}

/**
 * Paints one batch. A batch with a cell that isn't next to the one before it is refused whole: real brushes move one
 * cell at a time. The ink runs out on a batch that came too fast, and the rest of it is dropped.
 */
function paint(s: S, playerId: PlayerId, strokes: number[][], now: number): Step<S> {
  const pen = s.pens[playerId];
  if (s.phase !== "paint" || !pen || s.left.includes(playerId)) return { state: s };
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++)
      if (!paintTouches(stroke[i - 1]!, stroke[i]!)) return { state: s };
  }
  const code = PAINT_CODES[s.players.findIndex((p) => p.id === playerId)];
  if (!code) return { state: s };

  pen.ink = Math.min(
    PAINT_INK.max + PAINT_INK.slack,
    pen.ink + (Math.max(0, now - pen.at) * PAINT_INK.perSecond) / 1000,
  );
  pen.at = now;
  pen.strokes += 1;
  const grid = s.grid.split("");
  const fresh: number[] = [];
  let over = 0;
  let potHit = false;
  const [potX, potY] = s.pot === null ? [-99, -99] : xy(s.pot);
  out: for (const stroke of strokes) {
    let from = pen.last;
    for (const c of stroke) {
      if (c === from) continue;
      const cost = from === null || !paintTouches(from, c) ? 1 + PAINT_INK.strokeCost : 1;
      if (pen.ink < cost) break out;
      pen.ink -= cost;
      from = c;
      pen.last = c;
      if (grid[c] !== code) {
        if (grid[c] !== PAINT_EMPTY) over += 1;
        grid[c] = code;
      }
      fresh.push(c);
      const [x, y] = xy(c);
      if (Math.abs(x - potX) <= POT_REACH && Math.abs(y - potY) <= POT_REACH) potHit = true;
    }
  }
  if (over) bumpStat(s.stats, playerId, "paintedOver", over);

  if (potHit && s.pot !== null) {
    const [px, py] = xy(s.pot);
    const splat: number[] = [];
    const r = Math.ceil(PAINT_POT_RADIUS);
    for (let y = py - r; y <= py + r; y++) {
      for (let x = px - r; x <= px + r; x++) {
        if (!inside(x, y) || (x - px) ** 2 + (y - py) ** 2 > PAINT_POT_RADIUS ** 2) continue;
        grid[at(x, y)] = code;
        splat.push(at(x, y));
      }
    }
    fresh.push(...splat);
    event(s, "pot", playerId, splat);
    bumpStat(s.stats, playerId, "paintPots");
    s.pot = null;
    s.potAt = now + seconds(s.pace, POT_AGAIN_SECONDS);
  }

  const filled = paintEnclosed(grid, code, fresh);
  if (filled.length) {
    for (const c of filled) grid[c] = code;
    event(s, "fill", playerId, filled);
    bumpStat(s.stats, playerId, "loopCells", filled.length);
  }
  s.grid = grid.join("");
  return { state: s };
}

export const paintGrab: GameDefinition<S, PaintGrabContent, PaintGrabAction, PaintGrabView> = {
  id: "paint-grab",
  title: "Paint Grab",
  tagline: "Paint the canvas in your colour, faster than everyone else.",
  rules: [
    `Everyone paints the same canvas at once, in their own colour. Drag to paint. ${ROUNDS} rounds of ${PAINT_SECONDS} seconds.`,
    "Paint right over anyone else's colour. Whoever has the most canvas when the clock runs out wins the round.",
    "Close a loop of your colour and everything inside fills in. Big loops, big grabs!",
    "Your brush runs on ink: scribble too fast and it lags behind until the ink refills.",
    "Grab the paint pot for a big splat of your colour.",
    `Each round: +${PAINT_GRAB_POINTS.place.join(", +")} for the most canvas, second and third, plus +${PAINT_GRAB_POINTS.perPercent} for every 1% you own.`,
  ],
  categories: ["drawing", "action"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 3,
  contentSchema: paintGrabContentSchema,
  actionSchema: paintGrabActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "paint-grab", spice, count: 0, avoid }),
  contentIds: () => [],

  init({ players, seed, now, pace }): Step<S> {
    const s: S = {
      players: players.slice(0, PAINT_CODES.length),
      left: [],
      phase: "ready",
      phaseEndsAt: 0,
      round: 0,
      grid: "",
      pens: {},
      pot: null,
      potAt: 0,
      potsSpawned: 0,
      events: [],
      eventSeq: 0,
      rounds: [],
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    newRound(s, now);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action": {
        const action = event.action as PaintGrabAction;
        return paint(s, event.playerId, action.strokes, event.now);
      }
      case "tick":
        if (event.now >= s.phaseEndsAt) return endPhase(s, event.now);
        if (s.phase === "paint" && s.pot === null && event.now >= s.potAt) spawnPot(s);
        return { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        // Their paint stays on the canvas for the others to paint over.
        delete s.pens[event.playerId];
        return { state: s };
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): PaintGrabView {
    const order = s.players.map((p) => p.id);
    const pen = viewer !== null ? s.pens[viewer] : undefined;
    const playing = viewer !== null && order.includes(viewer) && !s.left.includes(viewer);
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.round,
      totalRounds: ROUNDS,
      width: PAINT_W,
      height: PAINT_H,
      grid: s.grid,
      order,
      counts: paintCounts(s.grid, order),
      pot: s.pot,
      events: s.events,
      me: playing
        ? { last: pen?.last ?? null, at: pen?.at ?? s.phaseEndsAt, strokes: pen?.strokes ?? 0 }
        : null,
      rounds: s.rounds,
      points: s.points,
    };
  },

  // While painting, the room also wakes when the next pot is due.
  deadline: (s) =>
    s.phase === "done"
      ? null
      : s.phase === "paint" && s.pot === null
        ? Math.min(s.phaseEndsAt, s.potAt)
        : s.phaseEndsAt,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
