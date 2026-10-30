import { z } from "zod";
import {
  GRACE_MS,
  bumpStat,
  seconds,
  type GameDefinition,
  type GameEffect,
  type GameEvent,
  type JudgeChainsInput,
  type JudgeChainsResult,
  type Step,
} from "../engine";
import { createRng } from "../rng";
import { judgeChainsByKeywords } from "../text";
import type { GameStats, PlayerId, PlayerInfo } from "../types";

const MAX_STEPS = 6;
const WRITE_SECONDS = 50;
const DRAW_SECONDS = 80;
const DESCRIBE_SECONDS = 40;
/** Reveal time per chain: a beat per entry plus time to laugh. */
const REVEAL_SECONDS_PER_ENTRY = 4;
const REVEAL_SECONDS_EXTRA = 8;
const POINTS_PER_ENTRY = 50;
const POINTS_PER_HEART = 100;
const SUGGESTIONS_PER_PLAYER = 3;
/** How long the room waits for Claude's verdicts before falling back to fuzzy keyword matching. */
const JUDGE_SECONDS = 20;
export const NAILED_IT = { closeness: 8, points: 150 } as const;
export const CLOSE_ENOUGH = { closeness: 5, points: 75 } as const;
/** A chain must drift at least this far for its owner to get "Lost in Translation". */
const DRIFT_AWARD_MIN = 5;
const JUDGE_EFFECT_ID = "sl-judge";

export function guessBonus(closeness: number): number {
  if (closeness >= NAILED_IT.closeness) return NAILED_IT.points;
  if (closeness >= CLOSE_ENOUGH.closeness) return CLOSE_ENOUGH.points;
  return 0;
}

/** Stored by index, so new colors go at the end: light gray came after the first eight. */
export const DRAW_COLORS = ["#14213d", "#ffffff", "#ff6b57", "#ffc93c", "#00c4b8", "#38bdf8", "#8b5cf6", "#f472b6", "#cbd5e1"];
export const DRAW_SIZES = [3, 7, 14, 28];
/** Drawings are stored on a square canvas of this many units. */
export const CANVAS_UNITS = 1000;
const MAX_STROKES = 400;
const MAX_POINT_VALUES = 12000;

export const strokeSchema = z.object({
  c: z.number().int().min(0).max(DRAW_COLORS.length - 1),
  w: z.number().int().min(0).max(DRAW_SIZES.length - 1),
  /** Flattened x,y pairs in canvas units. */
  p: z.array(z.number().int().min(0).max(CANVAS_UNITS)).min(2),
  /**
   * How `p` is drawn. Left out, a freehand line. `shape`: an outline of even width, from the shape tools. `fill`: a
   * solid area from the bucket, as closed rings that each end on their first point; rings inside others cut holes.
   */
  k: z.enum(["shape", "fill"]).optional(),
  /**
   * Which part of a Doodle Champions fighter the stroke belongs to. Left out, it's an ordinary stroke, which a fighter
   * counts as body.
   */
  t: z.enum(["body", "legs", "arms", "weapon"]).optional(),
});
export type Stroke = z.infer<typeof strokeSchema>;
/** The parts a Doodle Champions fighter is drawn in (a stroke's `t`). */
export type StrokePart = NonNullable<Stroke["t"]>;
export const STROKE_PARTS: readonly StrokePart[] = ["body", "legs", "arms", "weapon"];

/** A drawing in paint order: every fill under every line, so filling an area never hides the lines around it. */
export function paintOrder<T extends { k?: Stroke["k"] }>(strokes: T[]): T[] {
  return [...strokes.filter((s) => s.k === "fill"), ...strokes.filter((s) => s.k !== "fill")];
}

/** A fill's rings: each runs until it comes back to its first point. */
export function fillRings(p: readonly number[]): [number, number][][] {
  const rings: [number, number][][] = [];
  let ring: [number, number][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) {
    ring.push([p[i]!, p[i + 1]!]);
    if (ring.length > 3 && p[i] === ring[0]![0] && p[i + 1] === ring[0]![1]) {
      rings.push(ring);
      ring = [];
    }
  }
  if (ring.length > 2) rings.push(ring);
  return rings;
}

const pathOf = (points: readonly (readonly number[])[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("");

/** SVG path data for a fill, to draw with `fill-rule="evenodd"`. */
export function fillPathData(p: readonly number[]): string {
  return fillRings(p)
    .map((ring) => `${pathOf(ring)}Z`)
    .join("");
}

/** SVG path data for a shape's outline, closed when it ends where it began. */
export function shapePathData(p: readonly number[]): string {
  const points: number[][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) points.push([p[i]!, p[i + 1]!]);
  const closed = points.length > 2 && p[0] === p.at(-2) && p[1] === p.at(-1);
  return closed ? `${pathOf(points.slice(0, -1))}Z` : pathOf(points);
}

const drawingSchema = z
  .array(strokeSchema)
  .max(MAX_STROKES)
  .refine((strokes) => strokes.reduce((n, s) => n + s.p.length, 0) <= MAX_POINT_VALUES, "Drawing too detailed");

export const skipLogicContentSchema = z.object({
  starters: z.array(z.object({ id: z.string(), text: z.string().min(3).max(160) })).min(1),
});
export type SkipLogicContent = z.infer<typeof skipLogicContentSchema>;

export const skipLogicActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("write"), text: z.string().trim().min(1).max(120) }),
  z.object({ type: z.literal("draw"), strokes: drawingSchema }),
  z.object({ type: z.literal("describe"), text: z.string().trim().min(1).max(120) }),
  z.object({ type: z.literal("heart"), chain: z.number().int().min(0), entry: z.number().int().min(0) }),
]);
export type SkipLogicAction = z.infer<typeof skipLogicActionSchema>;

export type ChainEntry =
  | { kind: "text"; authorId: PlayerId; text: string; timedOut: boolean }
  | { kind: "drawing"; authorId: PlayerId; strokes: Stroke[]; timedOut: boolean };

interface Chain {
  ownerId: PlayerId;
  entries: ChainEntry[];
  /** voter -> entry index */
  hearts: Record<PlayerId, number>;
}

type Phase = "write" | "draw" | "describe" | "judging" | "reveal" | "done";

interface Judgement {
  /** `${chain}:${entry}` -> 0-10 closeness of that guess to the text that was drawn. */
  closeness: Record<string, number>;
  chains: { drift: number; quip: string | null }[];
  judgedBy: "claude" | "keywords";
}

export interface SkipLogicState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  step: number;
  totalSteps: number;
  chains: Chain[];
  revealIndex: number;
  suggestions: Record<PlayerId, string[]>;
  judgement: Judgement | null;
  pace: number;
}

export interface SkipLogicView {
  phase: Phase;
  endsAt: number;
  step: number;
  totalSteps: number;
  /** What this player has to do now: write a question, draw the previous text, or describe the previous drawing. */
  task: { chain: number; previous: ChainEntry | null; done: boolean } | null;
  suggestions: string[];
  submittedIds: PlayerId[];
  reveal: {
    chain: number;
    totalChains: number;
    ownerId: PlayerId;
    entries: ChainEntry[];
    /** entry index -> players who hearted it */
    hearts: Record<number, PlayerId[]>;
    myHeart: number | null;
    /** Claude's verdict on each guess (by entry index), and on the chain as a whole. */
    verdicts: Record<number, { closeness: number; bonus: number }>;
    drift: number | null;
    quip: string | null;
    judgedBy: "claude" | "keywords" | null;
  } | null;
  points: Record<PlayerId, number>;
}

type S = SkipLogicState;

const phaseForStep = (step: number): Phase => (step === 0 ? "write" : step % 2 === 1 ? "draw" : "describe");
const secondsForPhase: Record<Phase, number> = {
  write: WRITE_SECONDS,
  draw: DRAW_SECONDS,
  describe: DESCRIBE_SECONDS,
  judging: JUDGE_SECONDS,
  reveal: 0,
  done: 0,
};

/** The chain a player works on at a step: everyone passes their work one seat to the right. */
const chainFor = (s: S, seat: number, step: number) => (seat - step + s.chains.length * MAX_STEPS) % s.chains.length;
const seatOf = (s: S, playerId: PlayerId) => s.players.findIndex((p) => p.id === playerId);

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  return s.phase === "reveal" || s.phase === "judging" ? s.phaseEndsAt : s.phaseEndsAt + GRACE_MS;
}

/** Each guess against the text its drawing was based on, plus each chain's first and last text. */
function judgeInput(s: S): JudgeChainsInput {
  return {
    chains: s.chains.map((c, chain) => {
      const texts = c.entries.filter((e) => e.kind === "text");
      const hops: JudgeChainsInput["chains"][number]["hops"] = [];
      for (let k = 2; k < c.entries.length; k += 2) {
        const guess = c.entries[k];
        const drawn = c.entries[k - 2];
        if (guess?.kind !== "text" || drawn?.kind !== "text" || guess.timedOut) continue;
        hops.push({ entry: k, drawn: drawn.text, guess: guess.text });
      }
      return {
        chain,
        original: texts[0]?.kind === "text" ? texts[0].text : "",
        final: texts.at(-1)?.kind === "text" ? (texts.at(-1) as { text: string }).text : "",
        hops,
      };
    }),
  };
}

function startJudging(s: S, now: number): GameEffect[] {
  s.phase = "judging";
  s.phaseMs = seconds(s.pace, JUDGE_SECONDS);
  s.phaseEndsAt = now + s.phaseMs;
  return [{ id: JUDGE_EFFECT_ID, kind: "judge_chains", input: judgeInput(s) }];
}

/** Takes Claude's verdicts, filling any gaps from keyword matching, then starts the reveal. */
function applyJudgement(s: S, result: JudgeChainsResult | null, now: number) {
  const input = judgeInput(s);
  const fallback = judgeChainsByKeywords(input);
  const clamp = (n: unknown, fb: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : fb);
  const closenessMap: Record<string, number> = {};
  for (const hop of fallback.hops) {
    const judged = result?.hops?.find((h) => h.chain === hop.chain && h.entry === hop.entry);
    closenessMap[`${hop.chain}:${hop.entry}`] = clamp(judged?.closeness, hop.closeness);
  }
  s.judgement = {
    judgedBy: result ? (result.judgedBy ?? "claude") : "keywords",
    closeness: closenessMap,
    chains: fallback.chains.map((c) => {
      const judged = result?.chains?.find((x) => x.chain === c.chain);
      const quip = typeof judged?.quip === "string" && judged.quip.trim() ? judged.quip.trim().slice(0, 140) : c.quip;
      return { drift: clamp(judged?.drift, c.drift), quip };
    }),
  };
  startReveal(s, 0, now);
}

function startStep(s: S, step: number, now: number) {
  s.step = step;
  s.phase = phaseForStep(step);
  s.phaseMs = seconds(s.pace, secondsForPhase[s.phase]);
  s.phaseEndsAt = now + s.phaseMs;
}

function startReveal(s: S, index: number, now: number) {
  s.phase = "reveal";
  s.revealIndex = index;
  const entries = s.chains[index]!.entries.length;
  s.phaseMs = seconds(s.pace, entries * REVEAL_SECONDS_PER_ENTRY + REVEAL_SECONDS_EXTRA);
  s.phaseEndsAt = now + s.phaseMs;
}

function stepComplete(s: S): boolean {
  return s.chains.every((c) => c.entries.length > s.step);
}

function fillMissing(s: S) {
  s.players.forEach((p, seat) => {
    const chain = s.chains[chainFor(s, seat, s.step)]!;
    if (chain.entries.length > s.step) return;
    if (s.phase === "write") {
      const text = s.suggestions[p.id]?.[0] ?? "How satisfied are you with this survey?";
      chain.entries.push({ kind: "text", authorId: p.id, text, timedOut: true });
    } else if (s.phase === "draw") {
      chain.entries.push({ kind: "drawing", authorId: p.id, strokes: [], timedOut: true });
    } else {
      chain.entries.push({ kind: "text", authorId: p.id, text: "¯\\_(ツ)_/¯", timedOut: true });
    }
  });
}

function endPhase(s: S, now: number): GameEffect[] | undefined {
  if (s.phase === "write" || s.phase === "draw" || s.phase === "describe") {
    fillMissing(s);
    if (s.step + 1 < s.totalSteps) startStep(s, s.step + 1, now);
    else return startJudging(s, now);
  } else if (s.phase === "judging") {
    applyJudgement(s, null, now);
  } else if (s.phase === "reveal") {
    if (s.revealIndex + 1 < s.chains.length) startReveal(s, s.revealIndex + 1, now);
    else s.phase = "done";
  }
  return undefined;
}

/** A player who left still counts as "done" for each step: their entry is filled in at the deadline. */
function maybeAdvance(s: S, now: number): GameEffect[] | undefined {
  if (s.phase !== "write" && s.phase !== "draw" && s.phase !== "describe") return;
  const waiting = s.players.some((p, seat) => {
    if (s.left.includes(p.id)) return false;
    return s.chains[chainFor(s, seat, s.step)]!.entries.length <= s.step;
  });
  if (!waiting) {
    fillMissing(s);
    if (stepComplete(s)) return endPhase(s, now);
  }
  return undefined;
}

function handleAction(s: S, playerId: PlayerId, action: SkipLogicAction, now: number): GameEffect[] | undefined {
  const seat = seatOf(s, playerId);
  if (seat === -1 || s.left.includes(playerId)) return;

  if (action.type === "heart") {
    if (s.phase !== "reveal" || action.chain > s.revealIndex) return;
    const chain = s.chains[action.chain];
    const entry = chain?.entries[action.entry];
    if (!chain || !entry || entry.authorId === playerId) return;
    chain.hearts[playerId] = action.entry;
    return;
  }

  if (action.type !== s.phase) return;
  const chain = s.chains[chainFor(s, seat, s.step)]!;
  if (chain.entries.length > s.step) return;
  chain.entries.push(
    action.type === "draw"
      ? { kind: "drawing", authorId: playerId, strokes: action.strokes, timedOut: false }
      : { kind: "text", authorId: playerId, text: action.text, timedOut: false },
  );
  return maybeAdvance(s, now);
}

function computePoints(s: S): { points: Record<PlayerId, number>; stats: GameStats } {
  const points: Record<PlayerId, number> = Object.fromEntries(s.players.map((p) => [p.id, 0]));
  const stats: GameStats = {};
  for (const chain of s.chains) {
    for (const entry of chain.entries) {
      if (entry.timedOut) continue;
      points[entry.authorId] = (points[entry.authorId] ?? 0) + POINTS_PER_ENTRY;
      if (entry.kind === "drawing") bumpStat(stats, entry.authorId, "drawings");
    }
    for (const index of Object.values(chain.hearts)) {
      const author = chain.entries[index]?.authorId;
      if (!author) continue;
      points[author] = (points[author] ?? 0) + POINTS_PER_HEART;
      bumpStat(stats, author, "hearts");
      if (chain.entries[index]!.kind === "drawing") bumpStat(stats, author, "drawingHearts");
    }
  }
  if (s.judgement) {
    // A good guess scores for the guesser and for the artist whose drawing made it possible.
    for (const [key, value] of Object.entries(s.judgement.closeness)) {
      const [chainIndex, entryIndex] = key.split(":").map(Number) as [number, number];
      const entries = s.chains[chainIndex]?.entries ?? [];
      const guess = entries[entryIndex];
      const drawing = entries[entryIndex - 1];
      const bonus = guessBonus(value);
      if (!guess || bonus === 0) continue;
      points[guess.authorId] = (points[guess.authorId] ?? 0) + bonus;
      if (value >= NAILED_IT.closeness) bumpStat(stats, guess.authorId, "nailedIt");
      if (drawing && !drawing.timedOut) {
        points[drawing.authorId] = (points[drawing.authorId] ?? 0) + bonus;
        if (value >= NAILED_IT.closeness) bumpStat(stats, drawing.authorId, "assists");
      }
    }
    const drifts = s.judgement.chains.map((c) => c.drift);
    const most = Math.max(...drifts);
    const chainIndex = drifts.indexOf(most);
    const owner = s.chains[chainIndex]?.ownerId;
    if (owner && most >= DRIFT_AWARD_MIN) bumpStat(stats, owner, "driftWin");
  }
  return { points, stats };
}

export const skipLogic: GameDefinition<S, SkipLogicContent, SkipLogicAction, SkipLogicView> = {
  id: "skip-logic",
  title: "Skip Logic",
  tagline: "Write a survey question. Draw it. Describe it. Watch it fall apart.",
  rules: [
    "Everyone writes a survey question to start a chain.",
    "Chains pass around the room: draw the text you get, then describe the drawing you get.",
    "Every guess is judged against what was drawn: +150 for nailing it, +75 for close. The artist gets the bonus too.",
    "Every chain is revealed. Heart your favorite moment in each: +100 per heart, plus 50 for each entry done in time.",
  ],
  categories: ["drawing"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 9,
  contentSchema: skipLogicContentSchema,
  actionSchema: skipLogicActionSchema,
  contentRequest: (playerCount, spice, avoid) => ({
    gameId: "skip-logic",
    spice,
    count: playerCount * SUGGESTIONS_PER_PLAYER,
    avoid,
  }),
  contentIds: (content) => content.starters.map((s) => s.id),

  init({ players, content, seed, now, pace }): Step<S> {
    const rng = createRng(seed);
    const starters = rng.shuffle(content.starters).map((s) => s.text);
    const suggestions: Record<PlayerId, string[]> = {};
    players.forEach((p, i) => {
      suggestions[p.id] = Array.from(
        { length: SUGGESTIONS_PER_PLAYER },
        (_, k) => starters[(i * SUGGESTIONS_PER_PLAYER + k) % starters.length]!,
      );
    });
    const s: S = {
      players,
      left: [],
      phase: "write",
      phaseEndsAt: 0,
      step: 0,
      totalSteps: Math.min(MAX_STEPS, players.length),
      chains: players.map((p) => ({ ownerId: p.id, entries: [], hearts: {} })),
      revealIndex: 0,
      suggestions,
      judgement: null,
      pace,
    };
    startStep(s, 0, now);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return { state: s, effects: handleAction(s, event.playerId, event.action as SkipLogicAction, event.now) };
      case "tick":
        return { state: s, effects: event.now >= deadline(s)! ? endPhase(s, event.now) : undefined };
      case "skip":
        return { state: s, effects: endPhase(s, event.now) };
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        return { state: s, effects: maybeAdvance(s, event.now) };
      case "effect_result":
        if (s.phase === "judging" && event.effectId === JUDGE_EFFECT_ID) {
          applyJudgement(s, event.result as JudgeChainsResult | null, event.now);
        }
        return { state: s };
    }
  },

  view(s, viewer): SkipLogicView {
    const seat = viewer ? seatOf(s, viewer) : -1;
    const working = s.phase === "write" || s.phase === "draw" || s.phase === "describe";
    let task: SkipLogicView["task"] = null;
    if (working && seat !== -1) {
      const index = chainFor(s, seat, s.step);
      const chain = s.chains[index]!;
      task = {
        chain: index,
        previous: s.step > 0 ? (chain.entries[s.step - 1] ?? null) : null,
        done: chain.entries.length > s.step,
      };
    }
    const submittedIds = working
      ? s.players.filter((_, i) => s.chains[chainFor(s, i, s.step)]!.entries.length > s.step).map((p) => p.id)
      : [];

    let reveal: SkipLogicView["reveal"] = null;
    if (s.phase === "reveal" || s.phase === "done") {
      const index = Math.min(s.revealIndex, s.chains.length - 1);
      const chain = s.chains[index]!;
      const hearts: Record<number, PlayerId[]> = {};
      for (const [voter, entry] of Object.entries(chain.hearts)) (hearts[entry] ??= []).push(voter);
      const verdicts: Record<number, { closeness: number; bonus: number }> = {};
      for (const [key, value] of Object.entries(s.judgement?.closeness ?? {})) {
        const [chainIndex, entryIndex] = key.split(":").map(Number) as [number, number];
        if (chainIndex === index) verdicts[entryIndex] = { closeness: value, bonus: guessBonus(value) };
      }
      reveal = {
        chain: index,
        totalChains: s.chains.length,
        ownerId: chain.ownerId,
        entries: chain.entries,
        hearts,
        myHeart: viewer ? (chain.hearts[viewer] ?? null) : null,
        verdicts,
        drift: s.judgement?.chains[index]?.drift ?? null,
        quip: s.judgement?.chains[index]?.quip ?? null,
        judgedBy: s.judgement?.judgedBy ?? null,
      };
    }

    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      step: s.step,
      totalSteps: s.totalSteps,
      task,
      suggestions: s.phase === "write" && viewer ? (s.suggestions[viewer] ?? []) : [],
      submittedIds,
      reveal,
      points: computePoints(s).points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => computePoints(s).points,
  stats: (s) => computePoints(s).stats,
};
