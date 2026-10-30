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

const ROUNDS = 3;
const HAND_SIZE = 6;
/** Cards each player may swap for a fresh one, per game. */
export const WORST_FEEDBACK_SWAPS = 2;
const ANSWER_SECONDS = 75;
const VOTE_SECONDS = 40;
const RESULTS_SECONDS = 9;
const POINTS_PER_VOTE = 100;
const UNANIMOUS_BONUS = 200;

const cardSchema = z.object({ id: z.string(), text: z.string().min(1).max(160) });
export type Card = z.infer<typeof cardSchema>;

export const worstFeedbackContentSchema = z.object({
  prompts: z.array(cardSchema).min(1),
  answers: z.array(cardSchema).min(8),
});
export type WorstFeedbackContent = z.infer<typeof worstFeedbackContentSchema>;

export const worstFeedbackActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), cardId: z.string() }),
  /** Trade a card in your hand for a fresh one from the deck, without answering. */
  z.object({ type: z.literal("swap"), cardId: z.string() }),
  z.object({ type: z.literal("write"), text: z.string().trim().min(1).max(140) }),
  z.object({ type: z.literal("vote"), answerId: z.string() }),
]);
export type WorstFeedbackAction = z.infer<typeof worstFeedbackActionSchema>;

interface Answer {
  answerId: string;
  text: string;
  written: boolean;
  auto: boolean;
}

export interface WorstFeedbackResult {
  answerId: string;
  text: string;
  authorId: PlayerId;
  voters: PlayerId[];
  points: number;
  written: boolean;
  auto: boolean;
  unanimous: boolean;
}

export interface WorstFeedbackState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: "answer" | "vote" | "results" | "done";
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  round: number;
  prompts: Card[];
  deck: Card[];
  discard: Card[];
  hands: Record<PlayerId, Card[]>;
  /** Card id -> the round its "new" marker shows in: the next round for a replacement, this one for a swap. */
  freshIn: Record<string, number>;
  swapsLeft: Record<PlayerId, number>;
  answers: Record<PlayerId, Answer>;
  /** Answer ids in ballot order (shuffled so authors can't be inferred). */
  ballot: string[];
  votes: Record<PlayerId, string>;
  results: WorstFeedbackResult[] | null;
  points: Record<PlayerId, number>;
  stats: GameStats;
  rngState: number;
  pace: number;
}

export interface WorstFeedbackView {
  phase: WorstFeedbackState["phase"];
  endsAt: number;
  round: number;
  totalRounds: number;
  prompt: string;
  /** Your hand, only for participants during the answer phase. `fresh` marks cards you haven't seen before. */
  hand: (Card & { fresh: boolean })[] | null;
  /** How many more cards you may swap this game, `null` for spectators. */
  swapsLeft: number | null;
  answeredIds: PlayerId[];
  myAnswer: string | null;
  ballot: { answerId: string; text: string; mine: boolean }[] | null;
  votedIds: PlayerId[];
  myVote: string | null;
  results: WorstFeedbackResult[] | null;
  points: Record<PlayerId, number>;
}

type S = WorstFeedbackState;

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  return s.phase === "results" ? s.phaseEndsAt : s.phaseEndsAt + GRACE_MS;
}

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));

function draw(s: S, rng: ReturnType<typeof createRng>): Card | undefined {
  if (s.deck.length === 0) {
    s.deck = rng.shuffle(s.discard);
    s.discard = [];
  }
  return s.deck.pop();
}

/** Takes a card out of a hand and deals a fresh one: in its place for a swap, at the end after playing it. */
function replaceCard(s: S, hand: Card[], index: number, swap: boolean): Card {
  const card = hand.splice(index, 1)[0]!;
  delete s.freshIn[card.id];
  s.discard.push(card);
  const rng = createRng(s.rngState);
  const replacement = draw(s, rng);
  s.rngState = rng.state();
  if (replacement) {
    hand.splice(swap ? index : hand.length, 0, replacement);
    s.freshIn[replacement.id] = swap ? s.round : s.round + 1;
  }
  return card;
}

function startAnswer(s: S, now: number) {
  s.phase = "answer";
  s.phaseMs = seconds(s.pace, ANSWER_SECONDS);
  s.phaseEndsAt = now + s.phaseMs;
  s.answers = {};
  s.ballot = [];
  s.votes = {};
  s.results = null;
}

function startVote(s: S, now: number) {
  // Anyone who didn't answer in time plays a random card from their hand.
  for (const p of active(s)) {
    if (s.answers[p.id]) continue;
    const hand = s.hands[p.id] ?? [];
    if (hand.length === 0) continue;
    const rng = createRng(s.rngState);
    const index = rng.int(hand.length);
    s.rngState = rng.state();
    const card = replaceCard(s, hand, index, false);
    s.answers[p.id] = { answerId: "", text: card.text, written: false, auto: true };
  }
  const rng = createRng(s.rngState);
  const authors = rng.shuffle(Object.keys(s.answers));
  authors.forEach((authorId, i) => {
    s.answers[authorId]!.answerId = `r${s.round}a${i}`;
  });
  s.ballot = authors.map((id) => s.answers[id]!.answerId);
  s.rngState = rng.state();

  if (s.ballot.length < 2) {
    startResults(s, now);
    return;
  }
  s.phase = "vote";
  s.phaseMs = seconds(s.pace, VOTE_SECONDS);
  s.phaseEndsAt = now + s.phaseMs;
}

function startResults(s: S, now: number) {
  const voterCount = active(s).length;
  const results: WorstFeedbackResult[] = Object.entries(s.answers).map(([authorId, a]) => {
    const voters = Object.entries(s.votes)
      .filter(([, answerId]) => answerId === a.answerId)
      .map(([voterId]) => voterId);
    const eligible = active(s).filter((p) => p.id !== authorId).length;
    const unanimous = voters.length >= 2 && voters.length === eligible && voterCount > 2;
    const points = voters.length * POINTS_PER_VOTE + (unanimous ? UNANIMOUS_BONUS : 0);
    return { answerId: a.answerId, text: a.text, authorId, voters, points, written: a.written, auto: a.auto, unanimous };
  });
  results.sort((a, b) => b.voters.length - a.voters.length);

  const top = results[0]?.voters.length ?? 0;
  for (const r of results) {
    addPoints(s.points, r.authorId, r.points);
    bumpStat(s.stats, r.authorId, "promoterVotes", r.voters.length);
    if (top > 0 && r.voters.length === top) bumpStat(s.stats, r.authorId, "roundWins");
    if (r.unanimous) bumpStat(s.stats, r.authorId, "unanimous");
    if (r.written) bumpStat(s.stats, r.authorId, "writeIns");
  }
  s.results = results;
  s.phase = "results";
  s.phaseMs = seconds(s.pace, RESULTS_SECONDS);
  s.phaseEndsAt = now + s.phaseMs;
}

function endPhase(s: S, now: number) {
  if (s.phase === "answer") startVote(s, now);
  else if (s.phase === "vote") startResults(s, now);
  else if (s.phase === "results") {
    s.round += 1;
    if (s.round >= s.prompts.length) s.phase = "done";
    else startAnswer(s, now);
  }
}

function maybeAdvance(s: S, now: number) {
  const players = active(s);
  if (s.phase === "answer" && players.every((p) => s.answers[p.id])) startVote(s, now);
  else if (s.phase === "vote") {
    const voters = players.filter((p) => s.ballot.some((id) => id !== s.answers[p.id]?.answerId));
    if (voters.every((p) => s.votes[p.id])) startResults(s, now);
  }
}

function handleAction(s: S, playerId: PlayerId, action: WorstFeedbackAction, now: number) {
  if (!active(s).some((p) => p.id === playerId)) return;
  if (s.phase === "answer" && action.type !== "vote") {
    if (s.answers[playerId]) return;
    if (action.type === "write") {
      s.answers[playerId] = { answerId: "", text: action.text, written: true, auto: false };
    } else {
      const hand = s.hands[playerId] ?? [];
      const index = hand.findIndex((c) => c.id === action.cardId);
      if (index === -1) return;
      if (action.type === "swap") {
        if ((s.swapsLeft[playerId] ?? 0) <= 0) return;
        s.swapsLeft[playerId]! -= 1;
        replaceCard(s, hand, index, true);
        return;
      }
      const card = replaceCard(s, hand, index, false);
      s.answers[playerId] = { answerId: "", text: card.text, written: false, auto: false };
    }
  } else if (s.phase === "vote" && action.type === "vote") {
    if (!s.ballot.includes(action.answerId)) return;
    if (s.answers[playerId]?.answerId === action.answerId) return;
    s.votes[playerId] = action.answerId;
  } else {
    return;
  }
  maybeAdvance(s, now);
}

export const worstFeedback: GameDefinition<S, WorstFeedbackContent, WorstFeedbackAction, WorstFeedbackView> = {
  id: "worst-feedback",
  title: "Worst Feedback Ever",
  tagline: "Write the most savage response to a very real survey.",
  rules: [
    "Everyone gets the same absurd survey question.",
    `Play a card from your hand or write your own answer. Don't like your cards? Swap up to ${WORST_FEEDBACK_SWAPS} per game.`,
    "Vote for the funniest answer (not your own). Every vote is 100 points.",
    "Win everyone's vote for a +200 unanimous bonus.",
  ],
  categories: ["words"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 8,
  contentSchema: worstFeedbackContentSchema,
  actionSchema: worstFeedbackActionSchema,
  contentRequest: (playerCount, spice, avoid) => ({
    gameId: "worst-feedback",
    spice,
    count: ROUNDS,
    extraCount: playerCount * (HAND_SIZE + ROUNDS + WORST_FEEDBACK_SWAPS) + 12,
    avoid,
  }),
  contentIds: (content) => content.prompts.map((p) => p.id),

  init({ players, content, seed, now, pace }): Step<S> {
    const rng = createRng(seed);
    const prompts = rng.shuffle(content.prompts).slice(0, ROUNDS);
    const s: S = {
      players,
      left: [],
      phase: "answer",
      phaseEndsAt: 0,
      round: 0,
      prompts,
      deck: rng.shuffle(content.answers),
      discard: [],
      hands: {},
      freshIn: {},
      swapsLeft: Object.fromEntries(players.map((p) => [p.id, WORST_FEEDBACK_SWAPS])),
      answers: {},
      ballot: [],
      votes: {},
      results: null,
      points: zeroPoints(players),
      stats: {},
      rngState: 0,
      pace,
    };
    for (const p of players) {
      s.hands[p.id] = [];
      for (let i = 0; i < HAND_SIZE; i++) {
        const card = draw(s, rng);
        if (card) s.hands[p.id]!.push(card);
      }
    }
    s.rngState = rng.state();
    startAnswer(s, now);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    switch (event.type) {
      case "action":
        handleAction(s, event.playerId, event.action as WorstFeedbackAction, event.now);
        break;
      case "tick":
        if (s.phase !== "done" && event.now >= deadline(s)!) endPhase(s, event.now);
        break;
      case "skip":
        if (s.phase !== "done") endPhase(s, event.now);
        break;
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        maybeAdvance(s, event.now);
        break;
    }
    return { state: s };
  },

  view(s, viewer): WorstFeedbackView {
    const isPlayer = viewer !== null && s.players.some((p) => p.id === viewer);
    const myAnswer = viewer ? s.answers[viewer] : undefined;
    const byAnswerId = new Map(Object.values(s.answers).map((a) => [a.answerId, a]));
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.round,
      totalRounds: s.prompts.length,
      prompt: s.prompts[Math.min(s.round, s.prompts.length - 1)]?.text ?? "",
      hand: isPlayer && s.phase === "answer" ? (s.hands[viewer!] ?? []).map((c) => ({ ...c, fresh: s.freshIn[c.id] === s.round })) : null,
      swapsLeft: isPlayer ? (s.swapsLeft[viewer!] ?? 0) : null,
      answeredIds: s.phase === "answer" ? Object.keys(s.answers) : [],
      myAnswer: myAnswer?.text ?? null,
      ballot:
        s.phase === "vote"
          ? s.ballot.map((answerId) => ({
              answerId,
              text: byAnswerId.get(answerId)!.text,
              mine: myAnswer?.answerId === answerId,
            }))
          : null,
      votedIds: s.phase === "vote" ? Object.keys(s.votes) : [],
      myVote: viewer ? (s.votes[viewer] ?? null) : null,
      results: s.phase === "results" || s.phase === "done" ? s.results : null,
      points: s.points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
