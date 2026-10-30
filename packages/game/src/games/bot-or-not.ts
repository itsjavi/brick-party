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
  type JudgeGuessResult,
  type Step,
} from "../engine";
import { createRng } from "../rng";
import { guessMatches } from "../text";
import type { GameStats, PlayerId, PlayerInfo } from "../types";

const MAX_ROUNDS = 3;
const ANSWER_SECONDS = 90;
const DISCUSS_SECONDS = 90;
const VOTE_SECONDS = 30;
const GUESS_SECONDS = 35;
const JUDGE_TIMEOUT_SECONDS = 12;
const RESULTS_SECONDS = 12;

export const POINTS = {
  correctVote: 150,
  botEscapes: 400,
  botGuess: 250,
} as const;

const pairSchema = z.object({
  id: z.string(),
  real: z.string().min(3).max(200),
  bot: z.string().min(3).max(200),
});
export type QuestionPair = z.infer<typeof pairSchema>;

export const botOrNotContentSchema = z.object({ pairs: z.array(pairSchema).min(1) });
export type BotOrNotContent = z.infer<typeof botOrNotContentSchema>;

export const botOrNotActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), text: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("vote"), targetId: z.string() }),
  z.object({ type: z.literal("guess"), text: z.string().trim().min(1).max(160) }),
]);
export type BotOrNotAction = z.infer<typeof botOrNotActionSchema>;

type Phase = "answer" | "discuss" | "vote" | "guess" | "judging" | "results" | "done";

export interface BotOrNotRound {
  botId: PlayerId;
  pair: QuestionPair;
  answers: Record<PlayerId, string>;
  ready: PlayerId[];
  votes: Record<PlayerId, PlayerId>;
  caught: boolean | null;
  guess: string | null;
  verdict: JudgeGuessResult | null;
  roundPoints: Record<PlayerId, number>;
}

export interface BotOrNotState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  roundIndex: number;
  rounds: BotOrNotRound[];
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
}

export interface BotOrNotView {
  phase: Phase;
  endsAt: number;
  round: number;
  totalRounds: number;
  /** `null` for spectators. */
  youAreBot: boolean | null;
  /** The question this viewer is answering: the decoy for the Bot, the real one for everyone else. */
  question: string;
  answeredIds: PlayerId[];
  myAnswer: string | null;
  answers: { playerId: PlayerId; text: string }[] | null;
  readyIds: PlayerId[];
  votedIds: PlayerId[];
  myVote: PlayerId | null;
  /** Revealed once the Bot is caught, or at the results. */
  botId: PlayerId | null;
  guess: string | null;
  reveal: {
    realQuestion: string;
    botQuestion: string;
    caught: boolean;
    verdict: JudgeGuessResult | null;
    tally: { targetId: PlayerId; voters: PlayerId[] }[];
    roundPoints: Record<PlayerId, number>;
  } | null;
  points: Record<PlayerId, number>;
}

type S = BotOrNotState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));
const current = (s: S) => s.rounds[s.roundIndex]!;

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  if (s.phase === "results" || s.phase === "discuss" || s.phase === "judging") return s.phaseEndsAt;
  return s.phaseEndsAt + GRACE_MS;
}

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

function tally(round: BotOrNotRound) {
  const byTarget = new Map<PlayerId, PlayerId[]>();
  for (const [voter, target] of Object.entries(round.votes)) {
    byTarget.set(target, [...(byTarget.get(target) ?? []), voter]);
  }
  return [...byTarget.entries()]
    .map(([targetId, voters]) => ({ targetId, voters }))
    .sort((a, b) => b.voters.length - a.voters.length);
}

function closeVote(s: S, now: number): Step<S> {
  const round = current(s);
  const t = tally(round);
  const top = t[0];
  // Caught only with strictly the most votes: a tie lets the Bot get away (DECISION-15).
  const caught = !!top && top.targetId === round.botId && (t[1]?.voters.length ?? 0) < top.voters.length;
  round.caught = caught;

  for (const [voter, target] of Object.entries(round.votes)) {
    if (voter !== round.botId && target === round.botId) {
      addPoints(round.roundPoints, voter, POINTS.correctVote);
      bumpStat(s.stats, voter, "botsSpotted");
    }
  }
  if (caught) {
    bumpStat(s.stats, round.botId, "timesCaught");
    if (s.left.includes(round.botId)) return finishRound(s, now);
    setPhase(s, "guess", now, GUESS_SECONDS);
  } else {
    addPoints(round.roundPoints, round.botId, POINTS.botEscapes);
    bumpStat(s.stats, round.botId, "botEscapes");
    if (top && top.targetId !== round.botId) bumpStat(s.stats, top.targetId, "framed");
    return finishRound(s, now);
  }
  return { state: s };
}

function submitGuess(s: S, guess: string | null, now: number): Step<S> {
  const round = current(s);
  round.guess = guess;
  if (!guess) {
    round.verdict = { correct: false };
    return finishRound(s, now);
  }
  setPhase(s, "judging", now, JUDGE_TIMEOUT_SECONDS);
  const effect: GameEffect = {
    id: `bn-r${s.roundIndex}-judge`,
    kind: "judge_guess",
    input: { realQuestion: round.pair.real, botQuestion: round.pair.bot, guess },
  };
  return { state: s, effects: [effect] };
}

function applyVerdict(s: S, verdict: JudgeGuessResult, now: number): Step<S> {
  const round = current(s);
  round.verdict = verdict;
  if (verdict.correct) {
    addPoints(round.roundPoints, round.botId, POINTS.botGuess);
    bumpStat(s.stats, round.botId, "botGuesses");
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
    case "answer":
      setPhase(s, "discuss", now, DISCUSS_SECONDS);
      return { state: s };
    case "discuss":
      setPhase(s, "vote", now, VOTE_SECONDS);
      return { state: s };
    case "vote":
      return closeVote(s, now);
    case "guess":
      return submitGuess(s, null, now);
    case "judging": {
      const round = current(s);
      return applyVerdict(s, { correct: guessMatches(round.pair.real, round.guess ?? "") }, now);
    }
    case "results":
      if (s.roundIndex + 1 >= s.rounds.length) {
        s.phase = "done";
      } else {
        s.roundIndex += 1;
        setPhase(s, "answer", now, ANSWER_SECONDS);
      }
      return { state: s };
    default:
      return { state: s };
  }
}

function maybeAdvance(s: S, now: number): Step<S> {
  const round = current(s);
  const players = active(s);
  if (s.phase === "answer" && players.every((p) => round.answers[p.id])) return endPhase(s, now);
  if (s.phase === "discuss" && players.every((p) => round.ready.includes(p.id))) return endPhase(s, now);
  if (s.phase === "vote" && players.every((p) => round.votes[p.id])) return endPhase(s, now);
  if (s.phase === "guess" && s.left.includes(round.botId)) return submitGuess(s, null, now);
  return { state: s };
}

function handleAction(s: S, playerId: PlayerId, action: BotOrNotAction, now: number): Step<S> {
  if (!active(s).some((p) => p.id === playerId)) return { state: s };
  const round = current(s);
  switch (action.type) {
    case "answer":
      if (s.phase !== "answer" || round.answers[playerId]) return { state: s };
      round.answers[playerId] = action.text;
      break;
    case "ready":
      if (s.phase !== "discuss" || round.ready.includes(playerId)) return { state: s };
      round.ready.push(playerId);
      break;
    case "vote":
      if (s.phase !== "vote" || action.targetId === playerId) return { state: s };
      if (!s.players.some((p) => p.id === action.targetId)) return { state: s };
      round.votes[playerId] = action.targetId;
      break;
    case "guess":
      if (s.phase !== "guess" || playerId !== round.botId) return { state: s };
      return submitGuess(s, action.text, now);
  }
  return maybeAdvance(s, now);
}

export const botOrNot: GameDefinition<S, BotOrNotContent, BotOrNotAction, BotOrNotView> = {
  id: "bot-or-not",
  title: "Bot or Not",
  tagline: "One of you got a different survey question. Find the bot.",
  rules: [
    "Everyone answers the same survey question, except the secret Bot, who got a slightly different one.",
    "Answers are revealed. Discuss and accuse in chat or on the call, but don't say the question out loud.",
    "Vote for the Bot: +150 if you're right. The Bot is caught only with more votes than anyone else; a tie lets it escape with +400.",
    "A caught Bot can still steal +250 by guessing the real question.",
  ],
  categories: ["words", "guessing"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 10,
  contentSchema: botOrNotContentSchema,
  actionSchema: botOrNotActionSchema,
  contentRequest: (playerCount, spice, avoid) => ({
    gameId: "bot-or-not",
    spice,
    count: Math.min(MAX_ROUNDS, playerCount),
    avoid,
  }),
  contentIds: (content) => content.pairs.map((p) => p.id),

  init({ players, content, seed, now, pace }): Step<S> {
    const rng = createRng(seed);
    const roundCount = Math.min(MAX_ROUNDS, players.length, content.pairs.length);
    const bots = rng.shuffle(players).slice(0, roundCount);
    const pairs = rng.shuffle(content.pairs);
    const s: S = {
      players,
      left: [],
      phase: "answer",
      phaseEndsAt: 0,
      roundIndex: 0,
      rounds: bots.map((bot, i) => ({
        botId: bot.id,
        pair: pairs[i]!,
        answers: {},
        ready: [],
        votes: {},
        caught: null,
        guess: null,
        verdict: null,
        roundPoints: {},
      })),
      points: zeroPoints(players),
      stats: {},
      pace,
    };
    setPhase(s, "answer", now, ANSWER_SECONDS);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return handleAction(s, event.playerId, event.action as BotOrNotAction, event.now);
      case "tick":
        return event.now >= deadline(s)! ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        return maybeAdvance(s, event.now);
      case "effect_result": {
        if (s.phase !== "judging" || event.effectId !== `bn-r${s.roundIndex}-judge`) return { state: s };
        const round = current(s);
        const result = event.result as JudgeGuessResult | null;
        const verdict =
          result && typeof result.correct === "boolean"
            ? result
            : { correct: guessMatches(round.pair.real, round.guess ?? "") };
        return applyVerdict(s, verdict, event.now);
      }
    }
  },

  view(s, viewer): BotOrNotView {
    const round = current(s);
    const isPlayer = viewer !== null && s.players.some((p) => p.id === viewer);
    const isBot = isPlayer && viewer === round.botId;
    const revealed = s.phase === "results" || s.phase === "done";
    const answersVisible = s.phase !== "answer";
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.roundIndex,
      totalRounds: s.rounds.length,
      youAreBot: isPlayer ? isBot : null,
      question: isBot && !revealed ? round.pair.bot : round.pair.real,
      answeredIds: Object.keys(round.answers),
      myAnswer: viewer ? (round.answers[viewer] ?? null) : null,
      answers: answersVisible
        ? s.players.map((p) => ({ playerId: p.id, text: round.answers[p.id] ?? "" }))
        : null,
      readyIds: round.ready,
      votedIds: Object.keys(round.votes),
      myVote: viewer ? (round.votes[viewer] ?? null) : null,
      botId: round.caught || revealed ? round.botId : null,
      guess: round.guess,
      reveal: revealed
        ? {
            realQuestion: round.pair.real,
            botQuestion: round.pair.bot,
            caught: !!round.caught,
            verdict: round.verdict,
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
