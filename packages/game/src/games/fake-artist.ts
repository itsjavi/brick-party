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
import { CANVAS_UNITS } from "./skip-logic";

const MAX_ROUNDS = 2;
/** Each player draws this many lines a round, one per turn. */
const LAPS = 2;
const TURN_SECONDS = 20;
const VOTE_SECONDS = 45;
const GUESS_SECONDS = 30;
const RESULTS_SECONDS = 14;
/** Every line is drawn at this size (an index into `DRAW_SIZES`), so nobody stands out by pen. */
export const FAKE_ARTIST_SIZE = 2;
/** Players' line colors, as `DRAW_COLORS` indexes: everything but white, in an order that keeps neighbors apart. */
export const FAKE_ARTIST_COLORS = [2, 4, 6, 3, 5, 7, 0, 8];

export const FAKE_ARTIST_POINTS = {
  correctVote: 150,
  fakeEscapes: 400,
  fakeGuess: 250,
} as const;

const wordSchema = z.object({
  id: z.string(),
  /** What the fake sees: a broad, plain category like "Animals". */
  category: z.string().min(2).max(24),
  /** One simple thing anyone can draw, in a word or two. */
  word: z.string().min(2).max(24),
});
export type FakeArtistWord = z.infer<typeof wordSchema>;

export const fakeArtistContentSchema = z.object({ words: z.array(wordSchema).min(1) });
export type FakeArtistContent = z.infer<typeof fakeArtistContentSchema>;

/** One freehand line as flattened x,y pairs in canvas units: no shapes or fills, and never huge. */
const linePointsSchema = z.array(z.number().int().min(0).max(CANVAS_UNITS)).min(2).max(1200);

export const fakeArtistActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), points: linePointsSchema }),
  z.object({ type: z.literal("vote"), targetId: z.string() }),
  z.object({ type: z.literal("guess"), text: z.string().trim().min(1).max(40) }),
]);
export type FakeArtistAction = z.infer<typeof fakeArtistActionSchema>;

type Phase = "draw" | "vote" | "guess" | "results" | "done";

export interface FakeArtistLine {
  playerId: PlayerId;
  /** Flattened x,y pairs in canvas units. Color and size come from the player. */
  p: number[];
}

export interface FakeArtistRound {
  fakeId: PlayerId;
  word: FakeArtistWord;
  /** Who draws each turn, in order: every player `LAPS` times. */
  turns: PlayerId[];
  lines: FakeArtistLine[];
  votes: Record<PlayerId, PlayerId>;
  caught: boolean | null;
  guess: string | null;
  guessCorrect: boolean | null;
  roundPoints: Record<PlayerId, number>;
}

export interface FakeArtistState {
  players: PlayerInfo[];
  left: PlayerId[];
  /** Each player's line color, as a `DRAW_COLORS` index. */
  colors: Record<PlayerId, number>;
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  roundIndex: number;
  turnIndex: number;
  rounds: FakeArtistRound[];
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
}

export interface FakeArtistView {
  phase: Phase;
  endsAt: number;
  round: number;
  totalRounds: number;
  /** `null` for spectators. */
  youAreFake: boolean | null;
  category: string;
  /** The secret word: `null` for the fake until the reveal, and for spectators. */
  word: string | null;
  colors: Record<PlayerId, number>;
  turns: PlayerId[];
  turn: number;
  /** Who draws now, during the draw phase. */
  drawerId: PlayerId | null;
  lines: FakeArtistLine[];
  votedIds: PlayerId[];
  myVote: PlayerId | null;
  /** Revealed once the fake is caught, or at the results. */
  fakeId: PlayerId | null;
  guess: string | null;
  reveal: {
    word: string;
    caught: boolean;
    guessCorrect: boolean | null;
    tally: { targetId: PlayerId; voters: PlayerId[] }[];
    roundPoints: Record<PlayerId, number>;
  } | null;
  points: Record<PlayerId, number>;
}

type S = FakeArtistState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));
const current = (s: S) => s.rounds[s.roundIndex]!;

/** Lowercase letters and digits only, without "a", "an" or "the" in front or a plural "s" at the end. */
function normalizeWord(text: string): string {
  const plain = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(a|an|the)\s+/, "")
    .replace(/[^a-z0-9]/g, "");
  return plain.length > 3 ? plain.replace(/(es|s)$/, "") : plain;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** Whether a guess names the word: case, spacing, "the" and plurals don't matter, and one typo is fine in long words. */
export function guessesWord(word: string, guess: string): boolean {
  const a = normalizeWord(word);
  const b = normalizeWord(guess);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 5 && editDistance(a, b) <= 1;
}

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  if (s.phase === "results") return s.phaseEndsAt;
  return s.phaseEndsAt + GRACE_MS;
}

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

function tally(round: FakeArtistRound) {
  const byTarget = new Map<PlayerId, PlayerId[]>();
  for (const [voter, target] of Object.entries(round.votes)) {
    byTarget.set(target, [...(byTarget.get(target) ?? []), voter]);
  }
  return [...byTarget.entries()]
    .map(([targetId, voters]) => ({ targetId, voters }))
    .sort((a, b) => b.voters.length - a.voters.length);
}

/** Moves to the next turn whose drawer is still here, or to the vote after the last one. */
function nextTurn(s: S, now: number, from: number): Step<S> {
  const round = current(s);
  let turn = from;
  while (turn < round.turns.length && s.left.includes(round.turns[turn]!)) turn++;
  s.turnIndex = turn;
  if (turn >= round.turns.length) setPhase(s, "vote", now, VOTE_SECONDS);
  else setPhase(s, "draw", now, TURN_SECONDS);
  return { state: s };
}

function closeVote(s: S, now: number): Step<S> {
  const round = current(s);
  const t = tally(round);
  const top = t[0];
  // Caught only with strictly the most votes: a tie lets the fake get away, as in Bot or Not (DECISION-15).
  const caught = !!top && top.targetId === round.fakeId && (t[1]?.voters.length ?? 0) < top.voters.length;
  round.caught = caught;
  for (const [voter, target] of Object.entries(round.votes)) {
    if (voter !== round.fakeId && target === round.fakeId) {
      addPoints(round.roundPoints, voter, FAKE_ARTIST_POINTS.correctVote);
      bumpStat(s.stats, voter, "fakesSpotted");
    }
  }
  if (caught && !s.left.includes(round.fakeId)) {
    setPhase(s, "guess", now, GUESS_SECONDS);
    return { state: s };
  }
  if (!caught) {
    addPoints(round.roundPoints, round.fakeId, FAKE_ARTIST_POINTS.fakeEscapes);
    bumpStat(s.stats, round.fakeId, "fakeEscapes");
    if (top && top.targetId !== round.fakeId) bumpStat(s.stats, top.targetId, "framedArtist");
  }
  return finishRound(s, now);
}

function submitGuess(s: S, guess: string | null, now: number): Step<S> {
  const round = current(s);
  round.guess = guess;
  round.guessCorrect = guess !== null && guessesWord(round.word.word, guess);
  if (round.guessCorrect) {
    addPoints(round.roundPoints, round.fakeId, FAKE_ARTIST_POINTS.fakeGuess);
    bumpStat(s.stats, round.fakeId, "fakeGuesses");
  }
  return finishRound(s, now);
}

function finishRound(s: S, now: number): Step<S> {
  const round = current(s);
  for (const [playerId, pts] of Object.entries(round.roundPoints)) addPoints(s.points, playerId, pts);
  setPhase(s, "results", now, RESULTS_SECONDS);
  return { state: s };
}

function endPhase(s: S, now: number): Step<S> {
  switch (s.phase) {
    case "draw":
      // A turn that runs out is skipped: no line from that player this time.
      return nextTurn(s, now, s.turnIndex + 1);
    case "vote":
      return closeVote(s, now);
    case "guess":
      return submitGuess(s, null, now);
    case "results":
      if (s.roundIndex + 1 >= s.rounds.length) {
        s.phase = "done";
        return { state: s };
      }
      s.roundIndex += 1;
      return nextTurn(s, now, 0);
    default:
      return { state: s };
  }
}

function maybeAdvance(s: S, now: number): Step<S> {
  const round = current(s);
  if (s.phase === "draw" && s.left.includes(round.turns[s.turnIndex]!))
    return nextTurn(s, now, s.turnIndex + 1);
  if (s.phase === "vote" && active(s).every((p) => round.votes[p.id])) return endPhase(s, now);
  if (s.phase === "guess" && s.left.includes(round.fakeId)) return submitGuess(s, null, now);
  return { state: s };
}

function handleAction(s: S, playerId: PlayerId, action: FakeArtistAction, now: number): Step<S> {
  if (!active(s).some((p) => p.id === playerId)) return { state: s };
  const round = current(s);
  switch (action.type) {
    case "line":
      if (s.phase !== "draw" || round.turns[s.turnIndex] !== playerId || action.points.length % 2)
        return { state: s };
      round.lines.push({ playerId, p: action.points });
      return nextTurn(s, now, s.turnIndex + 1);
    case "vote":
      if (s.phase !== "vote" || action.targetId === playerId) return { state: s };
      if (!s.players.some((p) => p.id === action.targetId)) return { state: s };
      round.votes[playerId] = action.targetId;
      return maybeAdvance(s, now);
    case "guess":
      if (s.phase !== "guess" || playerId !== round.fakeId) return { state: s };
      return submitGuess(s, action.text, now);
  }
}

/** Every player `LAPS` times, starting after a random player who isn't the fake, so the fake never goes first. */
function turnOrder(players: PlayerInfo[], fakeId: PlayerId, rng: ReturnType<typeof createRng>): PlayerId[] {
  const order = rng.shuffle(players.map((p) => p.id));
  const start = order.findIndex((id) => id !== fakeId);
  const lap = [...order.slice(start), ...order.slice(0, start)];
  return Array.from({ length: LAPS }, () => lap).flat();
}

export const fakeArtist: GameDefinition<S, FakeArtistContent, FakeArtistAction, FakeArtistView> = {
  id: "fake-artist",
  title: "Fake Artist",
  tagline: "Everyone knows what you're drawing. Except one of you.",
  rules: [
    "Everyone sees the same secret word, except the Fake Artist, who only sees its category.",
    "Take turns adding one line each to a shared drawing, twice around. Prove you know the word without giving it away.",
    "Vote for the fake: +150 if you're right. The fake is caught only with more votes than anyone else; a tie lets them escape with +400.",
    "A caught fake can still steal +250 by guessing the word.",
  ],
  categories: ["drawing", "guessing"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 8,
  contentSchema: fakeArtistContentSchema,
  actionSchema: fakeArtistActionSchema,
  contentRequest: (playerCount, spice, avoid) => ({
    gameId: "fake-artist",
    spice,
    count: Math.min(MAX_ROUNDS, playerCount),
    avoid,
  }),
  contentIds: (content) => content.words.map((w) => w.id),

  init({ players, content, seed, now, pace }): Step<S> {
    const rng = createRng(seed);
    const roundCount = Math.min(MAX_ROUNDS, players.length, content.words.length);
    const fakes = rng.shuffle(players).slice(0, roundCount);
    const words = rng.shuffle(content.words);
    const s: S = {
      players,
      left: [],
      colors: Object.fromEntries(
        players.map((p, i) => [p.id, FAKE_ARTIST_COLORS[i % FAKE_ARTIST_COLORS.length]!]),
      ),
      phase: "draw",
      phaseEndsAt: 0,
      roundIndex: 0,
      turnIndex: 0,
      rounds: fakes.map((fake, i) => ({
        fakeId: fake.id,
        word: words[i]!,
        turns: turnOrder(players, fake.id, rng),
        lines: [],
        votes: {},
        caught: null,
        guess: null,
        guessCorrect: null,
        roundPoints: {},
      })),
      points: zeroPoints(players),
      stats: {},
      pace,
    };
    return nextTurn(s, now, 0);
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return handleAction(s, event.playerId, event.action as FakeArtistAction, event.now);
      case "tick":
        return event.now >= deadline(s)! ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        return maybeAdvance(s, event.now);
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): FakeArtistView {
    const round = current(s);
    const isPlayer = viewer !== null && s.players.some((p) => p.id === viewer);
    const isFake = isPlayer && viewer === round.fakeId;
    const revealed = s.phase === "results" || s.phase === "done";
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.roundIndex,
      totalRounds: s.rounds.length,
      youAreFake: isPlayer ? isFake : null,
      category: round.word.category,
      word: revealed || (isPlayer && !isFake) ? round.word.word : null,
      colors: s.colors,
      turns: round.turns,
      turn: s.turnIndex,
      drawerId: s.phase === "draw" ? (round.turns[s.turnIndex] ?? null) : null,
      lines: round.lines,
      votedIds: Object.keys(round.votes),
      myVote: viewer ? (round.votes[viewer] ?? null) : null,
      fakeId: round.caught || revealed ? round.fakeId : null,
      guess: round.guess,
      reveal: revealed
        ? {
            word: round.word.word,
            caught: !!round.caught,
            guessCorrect: round.guessCorrect,
            tally: tally(round),
            roundPoints: round.roundPoints,
          }
        : null,
      points: s.points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
