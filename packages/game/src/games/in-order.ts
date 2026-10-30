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
 * In Order: a co-op game like The Mind. Everyone holds secret numbers from 1 to 100 and the team plays them all onto
 * one pile in rising order, with no turns and no saying numbers. The server takes plays in the order they arrive. A
 * card played while a lower one is still in someone's hand costs the team a life, and every lower card is thrown away.
 */

/** Levels in a game: level n deals n cards to everyone. */
const LEVELS = 3;
export const IN_ORDER_LIVES = 3;
export const IN_ORDER_MAX_CARD = 100;
/** A short countdown before each level, so everyone can look at their cards and settle in. */
const READY_SECONDS = 5;
/** Each level's time limit: generous, so only a table that's stuck runs out. Running out costs a life. */
const LEVEL_SECONDS = [60, 75, 90];
const LEVEL_END_SECONDS = 6;
const RESULTS_SECONDS = 12;

export const IN_ORDER_POINTS = {
  /** For everyone, for each level the team clears: level 1, 2 and 3. */
  level: [100, 200, 300],
  /** For everyone, for each life the team has left at the end. */
  lifeLeft: 50,
} as const;

export const inOrderContentSchema = z.object({});
export type InOrderContent = z.infer<typeof inOrderContentSchema>;

export const inOrderActionSchema = z.discriminatedUnion("type", [
  /** Plays your lowest card. Naming it means a double tap can't play the next one by accident. */
  z.object({ type: z.literal("play"), card: z.number().int().min(1).max(IN_ORDER_MAX_CARD) }),
]);
export type InOrderAction = z.infer<typeof inOrderActionSchema>;

type Phase = "ready" | "play" | "levelEnd" | "results" | "done";

export interface InOrderCard {
  playerId: PlayerId;
  card: number;
}

export interface InOrderPlay extends InOrderCard {
  /** Cards that were still held below this one: thrown away, and the team lost a life. */
  burned: InOrderCard[];
}

/** How a level ended: every card played, the time ran out, or the last life went. */
export type InOrderOutcome = "cleared" | "timeout" | "wiped";

export interface InOrderState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  /** 0-based: level 0 deals one card each. */
  level: number;
  lives: number;
  /** Each player's cards, lowest first. */
  hands: Record<PlayerId, number[]>;
  plays: InOrderPlay[];
  /** When this level's play started (or starts, during the countdown). */
  startedAt: number;
  /** When the pile last changed, or the level started. */
  since: number;
  outcome: InOrderOutcome | null;
  /** Cards nobody got to play, shown once the level is over. */
  leftover: InOrderCard[];
  levelsCleared: number;
  levelPoints: number;
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

export interface InOrderView {
  phase: Phase;
  endsAt: number;
  /** The level, 0-based. */
  round: number;
  totalRounds: number;
  cardsEach: number;
  lives: number;
  maxLives: number;
  /** Your cards, lowest first. `null` for spectators. */
  hand: number[] | null;
  /** How many cards each player still holds (never which). */
  holding: Record<PlayerId, number>;
  plays: InOrderPlay[];
  /** Cards played this level, so a play changes the moment. */
  turn: number;
  /** The top of the pile: 0 before the first card. */
  top: number;
  /** When the level's play started (or starts, during the countdown). */
  startedAt: number;
  /** When the pile last changed, or the level started. */
  since: number;
  outcome: InOrderOutcome | null;
  leftover: InOrderCard[];
  levelsCleared: number;
  /** What this level paid everyone, once it's over. */
  levelPoints: number;
  points: Record<PlayerId, number>;
}

type S = InOrderState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));
const held = (s: S) => Object.values(s.hands).reduce((n, h) => n + h.length, 0);

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

/** Deals a fresh level: `level + 1` different cards to everyone still here, from a shuffled 1-100. */
function deal(s: S, now: number) {
  const rng = createRng((s.seed + Math.imul(s.level + 1, 0x9e3779b1)) >>> 0);
  const deck = rng.shuffle(Array.from({ length: IN_ORDER_MAX_CARD }, (_, i) => i + 1));
  const each = s.level + 1;
  s.hands = Object.fromEntries(
    active(s).map((p, i) => [p.id, deck.slice(i * each, (i + 1) * each).sort((a, b) => a - b)]),
  );
  s.plays = [];
  s.outcome = null;
  s.leftover = [];
  s.levelPoints = 0;
  setPhase(s, "ready", now, READY_SECONDS);
  s.startedAt = s.phaseEndsAt;
  s.since = s.phaseEndsAt;
}

function endLevel(s: S, outcome: InOrderOutcome, now: number, loseLife = true): Step<S> {
  s.outcome = outcome;
  if (outcome === "timeout" && loseLife) s.lives -= 1;
  s.leftover = Object.entries(s.hands)
    .flatMap(([playerId, cards]) => cards.map((card) => ({ playerId, card })))
    .sort((a, b) => a.card - b.card);
  for (const id of Object.keys(s.hands)) s.hands[id] = [];
  if (outcome === "cleared") {
    s.levelsCleared += 1;
    s.levelPoints = IN_ORDER_POINTS.level[s.level] ?? 0;
    for (const p of active(s)) addPoints(s.points, p.id, s.levelPoints);
  }
  if (s.lives <= 0 || s.level + 1 >= LEVELS) return finish(s, now);
  setPhase(s, "levelEnd", now, LEVEL_END_SECONDS);
  return { state: s };
}

function finish(s: S, now: number): Step<S> {
  s.lives = Math.max(0, s.lives);
  if (s.lives > 0) for (const p of active(s)) addPoints(s.points, p.id, s.lives * IN_ORDER_POINTS.lifeLeft);
  setPhase(s, "results", now, RESULTS_SECONDS);
  return { state: s };
}

function endPhase(s: S, now: number, skipped = false): Step<S> {
  switch (s.phase) {
    case "ready":
      setPhase(s, "play", now, LEVEL_SECONDS[s.level] ?? LEVEL_SECONDS.at(-1)!);
      s.startedAt = now;
      s.since = now;
      return maybeClear(s, now);
    case "play":
      // A host skipping the level costs nothing but the level's points.
      return endLevel(s, "timeout", now, !skipped);
    case "levelEnd":
      s.level += 1;
      deal(s, now);
      return { state: s };
    case "results":
      s.phase = "done";
      return { state: s };
    default:
      return { state: s };
  }
}

/** A level whose cards are all gone (played, or their holders left) is cleared. */
function maybeClear(s: S, now: number): Step<S> {
  if (s.phase === "play" && held(s) === 0) return endLevel(s, "cleared", now);
  return { state: s };
}

function play(s: S, playerId: PlayerId, card: number, now: number): Step<S> {
  if (s.phase !== "play" || s.left.includes(playerId)) return { state: s };
  const hand = s.hands[playerId];
  // Only your lowest card, and only the one you meant: a stale or doubled tap does nothing.
  if (!hand || hand[0] !== card) return { state: s };
  hand.shift();
  const burned: InOrderCard[] = [];
  for (const [id, cards] of Object.entries(s.hands)) {
    while (cards.length && cards[0]! < card) burned.push({ playerId: id, card: cards.shift()! });
  }
  burned.sort((a, b) => a.card - b.card);
  s.plays.push({ playerId, card, burned });
  s.since = now;
  if (burned.length) {
    s.lives -= 1;
    bumpStat(s.stats, playerId, "tooEarly");
    for (const b of burned) bumpStat(s.stats, b.playerId, "heldTooLong");
    if (s.lives <= 0) return endLevel(s, "wiped", now);
  }
  return maybeClear(s, now);
}

export const inOrder: GameDefinition<S, InOrderContent, InOrderAction, InOrderView> = {
  id: "in-order",
  title: "In Order",
  tagline: "Play every number in rising order. No turns, no talking numbers.",
  rules: [
    "Everyone gets secret numbers from 1 to 100: one card each in level 1, two in level 2, three in level 3.",
    "There are no turns. Play your lowest card whenever it feels right. Together, the team must play every card in rising order.",
    "Never say your numbers! Read the room instead: the longer everyone waits, the higher the next card probably is.",
    "A card played while someone still holds a lower one costs the team a life, and the lower cards are thrown away. The team shares 3 lives.",
    "Everyone scores the same: +100, +200 and +300 for each level cleared, and +50 for every life left at the end.",
  ],
  categories: ["action"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 4,
  contentSchema: inOrderContentSchema,
  actionSchema: inOrderActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "in-order", spice, count: 0, avoid }),
  contentIds: () => [],

  init({ players, seed, now, pace }): Step<S> {
    const s: S = {
      players,
      left: [],
      phase: "ready",
      phaseEndsAt: 0,
      level: 0,
      lives: IN_ORDER_LIVES,
      hands: {},
      plays: [],
      startedAt: now,
      since: now,
      outcome: null,
      leftover: [],
      levelsCleared: 0,
      levelPoints: 0,
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    deal(s, now);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action": {
        const action = event.action as InOrderAction;
        return play(s, event.playerId, action.card, event.now);
      }
      case "tick":
        return event.now >= s.phaseEndsAt ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now, true);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        // Their cards leave with them, unseen.
        delete s.hands[event.playerId];
        return maybeClear(s, event.now);
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): InOrderView {
    const playing = viewer !== null && s.players.some((p) => p.id === viewer);
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.level,
      totalRounds: LEVELS,
      cardsEach: s.level + 1,
      lives: s.lives,
      maxLives: IN_ORDER_LIVES,
      hand: playing ? [...(s.hands[viewer] ?? [])] : null,
      holding: Object.fromEntries(s.players.map((p) => [p.id, s.hands[p.id]?.length ?? 0])),
      plays: s.plays,
      turn: s.plays.length,
      top: s.plays.at(-1)?.card ?? 0,
      startedAt: s.startedAt,
      since: s.since,
      outcome: s.outcome,
      leftover: s.leftover,
      levelsCleared: s.levelsCleared,
      levelPoints: s.levelPoints,
      points: s.points,
    };
  },

  deadline: (s) => (s.phase === "done" ? null : s.phaseEndsAt),
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
