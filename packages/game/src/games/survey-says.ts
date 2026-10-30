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

const QUESTIONS = 5;
const ANSWER_SECONDS = 40;
const RESULTS_SECONDS = 12;
export const MAX_PREDICTION_POINTS = 200;
/** Points lost per unit a scale prediction is off from the team average. */
const SCALE_PENALTY = 40;
const OUTLIER_DISTANCE = 4;

const questionSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("who"), text: z.string().min(3).max(200) }),
  z.object({
    id: z.string(),
    kind: z.literal("scale"),
    text: z.string().min(3).max(200),
    minLabel: z.string().min(1).max(32),
    maxLabel: z.string().min(1).max(32),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("choice"),
    text: z.string().min(3).max(200),
    options: z.array(z.string().min(1).max(40)).min(2).max(4),
  }),
]);
export type SurveyQuestion = z.infer<typeof questionSchema>;

export const surveySaysContentSchema = z.object({ questions: z.array(questionSchema).min(1) });
export type SurveySaysContent = z.infer<typeof surveySaysContentSchema>;

/**
 * `answer` and `prediction` are a player id for "who" questions, an option index (as a string)
 * for "choice", and a 0-10 number for "scale".
 */
export const surveySaysActionSchema = z.object({
  type: z.literal("submit"),
  answer: z.union([z.string().max(64), z.number().min(0).max(10)]),
  prediction: z.union([z.string().max(64), z.number().min(0).max(10)]),
});
export type SurveySaysAction = z.infer<typeof surveySaysActionSchema>;

interface Submission {
  answer: string | number;
  prediction: string | number;
}

export interface SurveyResult {
  /** One row per option, in display order. */
  counts: { key: string; label: string; count: number }[];
  /** Keys of the winning options (ties allowed). Empty for scale questions. */
  winners: string[];
  /** Team average for scale questions. */
  average: number | null;
  predictions: { playerId: PlayerId; prediction: string | number; points: number }[];
}

export interface SurveySaysState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: "answer" | "results" | "done";
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  round: number;
  questions: SurveyQuestion[];
  submissions: Record<PlayerId, Submission>;
  results: SurveyResult | null;
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
}

export interface SurveyQuestionView {
  kind: SurveyQuestion["kind"];
  text: string;
  options: { key: string; label: string }[];
  minLabel: string | null;
  maxLabel: string | null;
}

export interface SurveySaysView {
  phase: SurveySaysState["phase"];
  endsAt: number;
  round: number;
  totalRounds: number;
  question: SurveyQuestionView;
  submittedIds: PlayerId[];
  mySubmission: Submission | null;
  results: SurveyResult | null;
  points: Record<PlayerId, number>;
}

type S = SurveySaysState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  return s.phase === "results" ? s.phaseEndsAt : s.phaseEndsAt + GRACE_MS;
}

function optionsFor(s: S, q: SurveyQuestion): { key: string; label: string }[] {
  if (q.kind === "who") return s.players.map((p) => ({ key: p.id, label: p.name }));
  if (q.kind === "choice") return q.options.map((label, i) => ({ key: String(i), label }));
  return [];
}

function isValid(s: S, q: SurveyQuestion, value: string | number): boolean {
  if (q.kind === "scale") return typeof value === "number" && value >= 0 && value <= 10;
  if (typeof value !== "string") return false;
  return optionsFor(s, q).some((o) => o.key === value);
}

function startAnswer(s: S, now: number) {
  s.phase = "answer";
  s.phaseMs = seconds(s.pace, ANSWER_SECONDS);
  s.phaseEndsAt = now + s.phaseMs;
  s.submissions = {};
  s.results = null;
}

function startResults(s: S, now: number) {
  const q = s.questions[s.round]!;
  const entries = Object.entries(s.submissions);
  let result: SurveyResult;

  if (q.kind === "scale") {
    const values = entries.map(([, sub]) => sub.answer as number);
    const average = values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : 0;
    const counts = Array.from({ length: 11 }, (_, n) => ({
      key: String(n),
      label: String(n),
      count: values.filter((v) => Math.round(v) === n).length,
    }));
    const predictions = entries.map(([playerId, sub]) => {
      const off = Math.abs((sub.prediction as number) - average);
      return {
        playerId,
        prediction: sub.prediction,
        points: Math.max(0, Math.round(MAX_PREDICTION_POINTS - off * SCALE_PENALTY)),
      };
    });
    for (const [playerId, sub] of entries) {
      if (Math.abs((sub.answer as number) - average) >= OUTLIER_DISTANCE) bumpStat(s.stats, playerId, "outlier");
    }
    result = { counts, winners: [], average, predictions };
  } else {
    const counts = optionsFor(s, q).map((o) => ({
      ...o,
      count: entries.filter(([, sub]) => sub.answer === o.key).length,
    }));
    const top = Math.max(0, ...counts.map((c) => c.count));
    const winners = top > 0 ? counts.filter((c) => c.count === top).map((c) => c.key) : [];
    const predictions = entries.map(([playerId, sub]) => ({
      playerId,
      prediction: sub.prediction,
      points: winners.includes(sub.prediction as string) ? MAX_PREDICTION_POINTS : 0,
    }));
    for (const [playerId, sub] of entries) {
      if (winners.length && !winners.includes(sub.answer as string)) bumpStat(s.stats, playerId, "outlier");
    }
    if (q.kind === "who") for (const id of winners) bumpStat(s.stats, id, "mostLikely");
    result = { counts, winners, average: null, predictions };
  }

  for (const p of result.predictions) {
    addPoints(s.points, p.playerId, p.points);
    bumpStat(s.stats, p.playerId, "mindReader", p.points);
  }
  s.results = result;
  s.phase = "results";
  s.phaseMs = seconds(s.pace, RESULTS_SECONDS);
  s.phaseEndsAt = now + s.phaseMs;
}

function endPhase(s: S, now: number) {
  if (s.phase === "answer") startResults(s, now);
  else if (s.phase === "results") {
    s.round += 1;
    if (s.round >= s.questions.length) s.phase = "done";
    else startAnswer(s, now);
  }
}

/** Picks questions with as much variety of kinds as the content allows. */
function pickQuestions(questions: SurveyQuestion[], count: number, seed: number): SurveyQuestion[] {
  const rng = createRng(seed);
  const byKind = new Map<string, SurveyQuestion[]>();
  for (const q of rng.shuffle(questions)) byKind.set(q.kind, [...(byKind.get(q.kind) ?? []), q]);
  const picked: SurveyQuestion[] = [];
  while (picked.length < count && [...byKind.values()].some((qs) => qs.length)) {
    for (const qs of byKind.values()) {
      const q = qs.shift();
      if (q && picked.length < count) picked.push(q);
    }
  }
  return rng.shuffle(picked);
}

export const surveySays: GameDefinition<S, SurveySaysContent, SurveySaysAction, SurveySaysView> = {
  id: "survey-says",
  title: "Survey Says",
  tagline: "Answer the team poll, then predict how everyone else answered.",
  rules: [
    "Each question is a quick team poll: pick a coworker, pick an option, or rate 0-10.",
    "Then predict the result: the most popular pick, or the team's average.",
    "Exact predictions are worth 200 points. Nobody sees who voted for whom.",
  ],
  categories: ["words", "guessing"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 6,
  contentSchema: surveySaysContentSchema,
  actionSchema: surveySaysActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "survey-says", spice, count: QUESTIONS, avoid }),
  contentIds: (content) => content.questions.map((q) => q.id),

  init({ players, content, seed, now, pace }): Step<S> {
    const s: S = {
      players,
      left: [],
      phase: "answer",
      phaseEndsAt: 0,
      round: 0,
      questions: pickQuestions(content.questions, QUESTIONS, seed),
      submissions: {},
      results: null,
      points: zeroPoints(players),
      stats: {},
      pace,
    };
    startAnswer(s, now);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action": {
        const action = event.action as SurveySaysAction;
        const q = s.questions[s.round]!;
        if (s.phase !== "answer" || s.submissions[event.playerId]) break;
        if (!active(s).some((p) => p.id === event.playerId)) break;
        if (!isValid(s, q, action.answer) || !isValid(s, q, action.prediction)) break;
        s.submissions[event.playerId] = { answer: action.answer, prediction: action.prediction };
        if (active(s).every((p) => s.submissions[p.id])) startResults(s, event.now);
        break;
      }
      case "tick":
        if (event.now >= deadline(s)!) endPhase(s, event.now);
        break;
      case "skip":
        endPhase(s, event.now);
        break;
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        if (s.phase === "answer" && active(s).every((p) => s.submissions[p.id])) startResults(s, event.now);
        break;
    }
    return { state: s };
  },

  view(s, viewer): SurveySaysView {
    const q = s.questions[Math.min(s.round, s.questions.length - 1)]!;
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.round,
      totalRounds: s.questions.length,
      question: {
        kind: q.kind,
        text: q.text,
        options: optionsFor(s, q),
        minLabel: q.kind === "scale" ? q.minLabel : null,
        maxLabel: q.kind === "scale" ? q.maxLabel : null,
      },
      submittedIds: Object.keys(s.submissions),
      mySubmission: viewer ? (s.submissions[viewer] ?? null) : null,
      results: s.phase === "answer" ? null : s.results,
      points: s.points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
