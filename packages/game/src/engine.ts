import type { z } from "zod";
import type { ContentRequest, GameCategory, GameId, GameStats, PlayerId, PlayerInfo, Spice } from "./types";

/** Extra time the server waits after a visible deadline, so clients can auto-submit at 0. */
export const GRACE_MS = 1500;

export type GameEvent =
  /** A player action that already passed the game's `actionSchema`. */
  | { type: "action"; playerId: PlayerId; action: unknown; now: number }
  /** The room's alarm fired; advance if the current phase is over. */
  | { type: "tick"; now: number }
  /** The host skipped the rest of the current phase. */
  | { type: "skip"; now: number }
  /** A participant left for good (grace period expired or kicked). */
  | { type: "player_left"; playerId: PlayerId; now: number }
  | { type: "effect_result"; effectId: string; result: unknown; now: number };

export interface JudgeGuessInput {
  realQuestion: string;
  botQuestion: string;
  guess: string;
}

export interface JudgeGuessResult {
  correct: boolean;
  quip?: string;
}

/** Skip Logic chains to judge: each guess against the text that was drawn, and how far each chain drifted. */
export interface JudgeChainsInput {
  chains: {
    chain: number;
    /** The question that started the chain. */
    original: string;
    /** The last text in the chain. */
    final: string;
    hops: { entry: number; drawn: string; guess: string }[];
  }[];
}

export interface JudgeChainsResult {
  /** 0 (nothing alike) to 10 (same question). */
  hops: { chain: number; entry: number; closeness: number }[];
  /** 0 (still the same question) to 10 (unrecognizable), with a one-line verdict. */
  chains: { chain: number; drift: number; quip: string }[];
  /** Who produced the verdicts; `keywords` is the offline fallback. */
  judgedBy?: "claude" | "keywords";
}

/**
 * Doodle Champions fighters to name and fights to commentate, described by their shapes (Claude never sees the
 * drawings). In fight lines, `{n}` stands for fighter n.
 */
export interface NameFightersInput {
  fighters: {
    n: number;
    /** A few words on the body, e.g. "round, huge". */
    body: string;
    legs: number;
    arms: number;
    /** "none", or a few words on the weapon. */
    weapon: string;
    moves: string;
    /** The body's main color, for flavor only. */
    color: string;
    /** The name it has unless Claude gives a better one. */
    stockName: string;
  }[];
  fights: {
    key: string;
    fighters: number[];
    /** `null` for a draw. */
    winner: number | null;
    how: "KO" | "decision" | "draw";
    seconds: number;
    moments: string[];
  }[];
}

export interface NameFightersResult {
  names: { n: number; name: string }[];
  /** Three lines per fight: the opening, the middle and the finish. */
  fights: { key: string; lines: string[] }[];
}

/** Async work a game needs the room to run (an AI call); the result comes back as `effect_result`. */
export type GameEffect =
  | { id: string; kind: "judge_guess"; input: JudgeGuessInput }
  | { id: string; kind: "judge_chains"; input: JudgeChainsInput }
  | { id: string; kind: "name_fighters"; input: NameFightersInput };

export interface Step<S> {
  state: S;
  effects?: GameEffect[];
}

/**
 * The phase timer every game's state keeps, which the match reads and moves for the host's "+N s" button: when the
 * current phase ends, and how long it was given. `deadline` must follow `phaseEndsAt`.
 */
export interface PhaseClock {
  phaseEndsAt: number;
  phaseMs?: number;
}

export interface GameSetup<C> {
  players: PlayerInfo[];
  content: C;
  spice: Spice;
  seed: number;
  now: number;
  /** Multiplies every phase duration. 1 in production; tests use smaller values. */
  pace: number;
}

export interface GameDefinition<S = any, C = any, A = any, V = any> {
  id: GameId;
  title: string;
  tagline: string;
  rules: string[];
  /** What kind of game it is (`GAME_CATEGORIES`), for filtering the list of games. */
  categories: GameCategory[];
  minPlayers: number;
  maxPlayers: number;
  minutes: number;
  contentSchema: z.ZodType<C>;
  actionSchema: z.ZodType<A>;
  contentRequest(playerCount: number, spice: Spice, avoid: string[]): ContentRequest;
  /** Ids of the prompts this content uses, so a match can avoid repeating them. */
  contentIds(content: C): string[];
  init(setup: GameSetup<C>): Step<S>;
  reduce(state: S, event: GameEvent): Step<S>;
  /** What one viewer may see. `null` is a spectator. Must never leak other players' secrets. */
  view(state: S, viewer: PlayerId | null): V;
  /** When the room should next tick this game, including grace. `null` when nothing is pending. */
  deadline(state: S): number | null;
  isOver(state: S): boolean;
  scores(state: S): Record<PlayerId, number>;
  stats(state: S): GameStats;
  /**
   * Whether the game runs live right now (DECISION-19): the room then ticks it every `tickMs` from memory, on top of
   * its deadlines, while someone is in the room and the match isn't paused. Each tick, and each action, should copy
   * only what it changes, since they come many times a second.
   */
  live?(state: S): { tickMs: number } | null;
  /** A live game's move for one of the server's bots on this tick, or `null` to leave its input as it is. */
  botInput?(state: S, playerId: PlayerId, now: number): A | null;
}

export function seconds(pace: number, s: number): number {
  return Math.max(1000, Math.round(s * 1000 * pace));
}

export function addPoints(points: Record<PlayerId, number>, playerId: PlayerId, amount: number) {
  points[playerId] = (points[playerId] ?? 0) + amount;
}

export function bumpStat(stats: GameStats, playerId: PlayerId, key: string, amount = 1) {
  const row = (stats[playerId] ??= {});
  row[key] = (row[key] ?? 0) + amount;
}

export function zeroPoints(players: PlayerInfo[]): Record<PlayerId, number> {
  return Object.fromEntries(players.map((p) => [p.id, 0]));
}
