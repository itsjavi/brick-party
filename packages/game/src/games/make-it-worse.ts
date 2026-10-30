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
import { createRng, type Rng } from "../rng";
import type { GameStats, PlayerId, PlayerInfo } from "../types";

/**
 * Make It Worse: everyone gets the same short survey and sabotages it with traps from a preset palette, under a
 * budget (DECISION-20). Then a few of the forms are played, one at a time: everyone but the designer races to fill it in
 * with the answers on a sticky note. Every trap has a trick that gets you past it, and the reveal shows the trick and
 * the real-world fix. Traps run on the player's screen; the server only checks the answers and the time.
 */

export const MIW_BUDGET = 7;
/** Forms played in a match (DECISION-22); the rest go to the gallery. Rooms with this many players or fewer play all. */
export const MIW_FORMS_PLAYED = 4;
const BUILD_SECONDS = 90;
const READY_SECONDS = 6;
const PLAY_SECONDS = 75;
const REVEAL_SECONDS = 16;
const GALLERY_SECONDS = 12;

export const MIW_POINTS = {
  /** For a filler, per answer that matches the sticky note. */
  correct: 50,
  /** For a filler who gets to Submit, plus up to `speed` more the faster they were. */
  finish: 100,
  speed: 200,
  /** Taken from a filler who said yes to the upsell. */
  upsold: 100,
  /** For the designer, per wrong answer (and upsell) a filler gave. */
  wrong: 50,
  /** For the designer, per second each filler spent on the form (the whole limit for those who never finished). */
  second: 3,
  /** The designer's points count as if this many players filled in the form, so room size doesn't matter. */
  fillersCounted: 3,
} as const;

export const TRAP_IDS = [
  "runaway",
  "modals",
  "tabmaze",
  "captcha",
  "terms",
  "disguised",
  "confirmshame",
  "reversed",
  "doubleneg",
  "ghost",
  "slider",
  "tiny",
] as const;
export type TrapId = (typeof TRAP_IDS)[number];

export const QUESTION_KINDS = ["choice", "rating", "number", "consent"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface TrapInfo {
  id: TrapId;
  name: string;
  /** Budget points. */
  cost: number;
  /** Where it goes: the whole form, or a question (of one kind, or `any`). */
  target: "form" | "any" | QuestionKind;
  /** What it does, for the builder. */
  does: string;
  /** How to get past it, for the reveal. */
  trick: string;
  /** What a real form should do instead, for the reveal. */
  fix: string;
  /** Falling for it means a wrong answer on its question, which the server sees; other traps are reported by players. */
  reading: boolean;
  /** Whether it blocks the way until you get past it: one more step in everyone's progress bar. */
  gate: boolean;
  /** Roughly how many seconds it costs a bot, in a 75-second form. */
  botSeconds: number;
}

export const TRAPS: Record<TrapId, TrapInfo> = {
  runaway: {
    id: "runaway",
    name: "Runaway button",
    cost: 2,
    target: "form",
    does: "Submit dodges the mouse.",
    trick: "Tab to the button and press Enter.",
    fix: "Buttons stay where they are. Motion is for feedback, never for running away.",
    reading: false,
    gate: false,
    botSeconds: 6,
  },
  modals: {
    id: "modals",
    name: "Modal loop",
    cost: 2,
    target: "form",
    does: "A popup greets you, and closing it opens another one.",
    trick: "Esc closes the whole stack at once.",
    fix: "One popup at most, closed by its X, by Esc and by clicking outside it.",
    reading: false,
    gate: true,
    botSeconds: 5,
  },
  tabmaze: {
    id: "tabmaze",
    name: "Tab order maze",
    cost: 3,
    target: "form",
    does: "Clicks don't reach the fields, and Tab jumps around in a scrambled order.",
    trick: "Follow the focus ring with Tab, and Shift+Tab back when it overshoots.",
    fix: "Tab order follows the reading order, and every field takes a click.",
    reading: false,
    gate: false,
    botSeconds: 8,
  },
  captcha: {
    id: "captcha",
    name: "Impossible CAPTCHA",
    cost: 2,
    target: "form",
    does: "Prove you're human by picking every square with a feeling. Nothing is ever right.",
    trick: 'The small "accessible version" link under the puzzle.',
    fix: "Invisible bot checks first, and a real alternative for anyone who can't solve a puzzle.",
    reading: false,
    gate: true,
    botSeconds: 6,
  },
  terms: {
    id: "terms",
    name: "Scroll the terms",
    cost: 2,
    target: "form",
    does: "Accept only works once you've scrolled to the bottom of a very long terms box.",
    trick: "Click into the box and press End (or Page Down).",
    fix: "A short summary and a link to the full terms. Nobody has to scroll to agree.",
    reading: false,
    gate: true,
    botSeconds: 5,
  },
  disguised: {
    id: "disguised",
    name: "Disguised buttons",
    cost: 2,
    target: "form",
    does: "Submit looks disabled, and the big bright button wipes the form.",
    trick: "Read the button, not the colour.",
    fix: "The main action looks like the main action. Destructive buttons look destructive and ask first.",
    reading: false,
    gate: false,
    botSeconds: 3,
  },
  confirmshame: {
    id: "confirmshame",
    name: "Confirmshaming",
    cost: 1,
    target: "form",
    does: "Submit asks you to upgrade: a huge Yes, and a tiny, guilt-tripping No.",
    trick: "The small link is the way out.",
    fix: "Both choices the same size, and a No that doesn't insult anyone.",
    reading: false,
    gate: false,
    botSeconds: 2,
  },
  reversed: {
    id: "reversed",
    name: "Backwards scale",
    cost: 1,
    target: "rating",
    does: "The rating scale runs from 5 down to 1.",
    trick: "Read the numbers, not the positions.",
    fix: "Scales run the same way everywhere, low to high, with labels at both ends.",
    reading: true,
    gate: false,
    botSeconds: 1.5,
  },
  doubleneg: {
    id: "doubleneg",
    name: "Double negative",
    cost: 1,
    target: "consent",
    does: "The checkbox is ticked already, and its label is a double negative.",
    trick: "Read it twice. Ticked means no.",
    fix: 'Unticked by default, worded as a plain yes: "Send me the newsletter".',
    reading: true,
    gate: false,
    botSeconds: 2,
  },
  ghost: {
    id: "ghost",
    name: "Ghost text",
    cost: 1,
    target: "any",
    does: "A question in almost-white on white.",
    trick: "Select the text to highlight it.",
    fix: "Text has enough contrast to read: at least 4.5 to 1 against its background.",
    reading: true,
    gate: false,
    botSeconds: 2,
  },
  slider: {
    id: "slider",
    name: "Number slider",
    cost: 2,
    target: "number",
    does: "A number you'd type becomes a tiny slider.",
    trick: "Click the slider, then the arrow keys step one at a time.",
    fix: "Numbers get a number field. Sliders are for rough amounts, not exact ones.",
    reading: true,
    gate: false,
    botSeconds: 4,
  },
  tiny: {
    id: "tiny",
    name: "Microscopic targets",
    cost: 1,
    target: "choice",
    does: "The options shrink to dots, and their labels don't take a click.",
    trick: "Tab into the options and pick with the arrow keys.",
    fix: "The whole label is clickable, and targets are at least 24 pixels.",
    reading: true,
    gate: false,
    botSeconds: 3,
  },
};

const label = z.string().trim().min(1).max(20);
const questionText = z.string().trim().min(5).max(100);

export const miwQuestionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    label,
    text: questionText,
    options: z.array(z.string().trim().min(1).max(32)).min(3).max(4),
  }),
  z.object({
    kind: z.literal("rating"),
    label,
    text: questionText,
    low: z.string().trim().min(1).max(24),
    high: z.string().trim().min(1).max(24),
  }),
  z
    .object({
      kind: z.literal("number"),
      label,
      text: questionText,
      min: z.number().int().min(0),
      max: z.number().int().max(1000),
      unit: z.string().trim().max(16),
    })
    .refine((q) => q.max - q.min >= 10, "a number question needs a range of at least 10"),
  /** A checkbox: `text` is its plain label ("Email me the newsletter"), `thing` what it's about, for the double negative. */
  z.object({
    kind: z.literal("consent"),
    label,
    text: questionText,
    thing: z.string().trim().min(3).max(40),
  }),
]);
export type MiwQuestion = z.infer<typeof miwQuestionSchema>;

export const miwSurveySchema = z.object({
  id: z.string(),
  title: z.string().trim().min(3).max(48),
  intro: z.string().trim().min(5).max(120),
  questions: z.array(miwQuestionSchema).min(3).max(5),
});
export type MiwSurvey = z.infer<typeof miwSurveySchema>;

export const makeItWorseContentSchema = z.object({ surveys: z.array(miwSurveySchema).min(1) });
export type MakeItWorseContent = z.infer<typeof makeItWorseContentSchema>;

/** A choice's option index, a rating 1-5, a number, or a ticked box. `null` is unanswered. */
export type MiwAnswer = number | boolean | null;

const placedTrapSchema = z.object({
  trap: z.enum(TRAP_IDS),
  question: z.number().int().min(0).max(4).optional(),
});
export type PlacedTrap = z.infer<typeof placedTrapSchema>;

export const makeItWorseActionSchema = z.discriminatedUnion("type", [
  /** Your whole form so far; `lock` says you're done building. */
  z.object({
    type: z.literal("form"),
    traps: z.array(placedTrapSchema).max(TRAP_IDS.length),
    lock: z.boolean().optional(),
  }),
  /** How far you've got: steps passed out of `checkpoints`, and the trap you're stuck on. */
  z.object({
    type: z.literal("progress"),
    done: z.number().int().min(0).max(20),
    stuck: z.enum(TRAP_IDS).nullable(),
  }),
  z.object({
    type: z.literal("submit"),
    answers: z.array(z.union([z.number().int().min(0).max(1000), z.boolean(), z.null()])).max(5),
    /** The traps you got caught by on the way (the ones the server can't see). */
    fell: z.array(z.enum(TRAP_IDS)).max(TRAP_IDS.length),
    /** Said yes to the upsell. */
    upsold: z.boolean(),
  }),
]);
export type MakeItWorseAction = z.infer<typeof makeItWorseActionSchema>;

type Phase = "build" | "ready" | "play" | "reveal" | "gallery" | "done";

export interface MiwForm {
  designerId: PlayerId;
  traps: PlacedTrap[];
  /** The designer ran out of time with nothing placed, so the form got random traps. */
  auto: boolean;
}

export interface MiwProgress {
  done: number;
  stuck: TrapId | null;
  finished: boolean;
}

export interface MiwPlayerResult {
  playerId: PlayerId;
  finished: boolean;
  seconds: number;
  correct: number;
  /** Question indexes answered wrong (or left blank). */
  wrong: number[];
  upsold: boolean;
  points: number;
}

export interface MiwResult {
  players: MiwPlayerResult[];
  traps: (PlacedTrap & { fellIds: PlayerId[] })[];
  designerPoints: number;
  /** Fewer than half the players finished, so the designer scores nothing. */
  sued: boolean;
  /** The fastest finisher. */
  fastestId: PlayerId | null;
}

interface Submission {
  answers: MiwAnswer[];
  fell: TrapId[];
  upsold: boolean;
  at: number;
}

interface Run {
  form: MiwForm;
  answers: MiwAnswer[];
  fillers: PlayerId[];
  startedAt: number;
  progress: Record<PlayerId, { done: number; stuck: TrapId | null }>;
  submissions: Record<PlayerId, Submission>;
  result: MiwResult | null;
}

export interface MakeItWorseState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given, before any time the host added. */
  phaseMs?: number;
  survey: MiwSurvey;
  forms: Record<PlayerId, { traps: PlacedTrap[]; locked: boolean; auto: boolean }>;
  /** Designers whose forms are played, in order. Set when building ends. */
  order: PlayerId[];
  round: number;
  run: Run | null;
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

export interface MakeItWorseView {
  phase: Phase;
  endsAt: number;
  /** The form being played, 0-based. */
  round: number;
  totalRounds: number;
  survey: MiwSurvey;
  budget: number;
  /** Your form while building, `null` for spectators. */
  myForm: { traps: PlacedTrap[]; locked: boolean } | null;
  /** Who's building, and who's done. */
  builders: PlayerId[];
  lockedIds: PlayerId[];
  run: {
    form: MiwForm;
    /** The sticky note: the answers to give, one per question. */
    answers: MiwAnswer[];
    startedAt: number;
    /** Steps in everyone's progress: the questions, each gate trap, and Submit. */
    checkpoints: number;
    fillers: PlayerId[];
    progress: Record<PlayerId, MiwProgress>;
    /** You fill in this form (you're not its designer, and you're playing). */
    youFill: boolean;
    submitted: boolean;
    result: MiwResult | null;
  } | null;
  /** The forms nobody played, once the gallery is up. */
  gallery: MiwForm[];
  points: Record<PlayerId, number>;
}

type S = MakeItWorseState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

/** Every step a filler passes: the gate traps first and last, the questions in between, and Submit. */
export function miwCheckpoints(survey: Pick<MiwSurvey, "questions">, traps: readonly PlacedTrap[]): number {
  return survey.questions.length + traps.filter((t) => TRAPS[t.trap].gate).length + 1;
}

export function formCost(traps: readonly PlacedTrap[]): number {
  return traps.reduce((n, t) => n + TRAPS[t.trap].cost, 0);
}

/** Whether a trap fits this question (or, without one, the whole form). */
export function trapFits(
  survey: Pick<MiwSurvey, "questions">,
  trap: TrapId,
  question: number | undefined,
): boolean {
  const target = TRAPS[trap].target;
  if (target === "form") return question === undefined;
  if (question === undefined) return false;
  const q = survey.questions[question];
  return !!q && (target === "any" || q.kind === target);
}

/** Why a form can't be built, or `null` when it's fine: known traps, each once, on a fitting spot, within budget. */
export function formProblem(
  survey: Pick<MiwSurvey, "questions">,
  traps: readonly PlacedTrap[],
): string | null {
  const seen = new Set<TrapId>();
  for (const t of traps) {
    if (seen.has(t.trap)) return `${TRAPS[t.trap].name} fits once per form`;
    seen.add(t.trap);
    if (!trapFits(survey, t.trap, t.question)) return `${TRAPS[t.trap].name} doesn't fit there`;
  }
  if (formCost(traps) > MIW_BUDGET) return `over budget (${formCost(traps)} of ${MIW_BUDGET})`;
  return null;
}

/** Random traps within the budget: what a bot builds, and what a form left empty gets. */
export function randomForm(survey: Pick<MiwSurvey, "questions">, random: () => number): PlacedTrap[] {
  const traps: PlacedTrap[] = [];
  let left = MIW_BUDGET;
  const ids = [...TRAP_IDS];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  for (const id of ids) {
    if (TRAPS[id].cost > left) continue;
    const spots =
      TRAPS[id].target === "form"
        ? [undefined]
        : survey.questions.flatMap((_, i) => (trapFits(survey, id, i) ? [i] : []));
    if (!spots.length) continue;
    const question = spots[Math.floor(random() * spots.length)];
    traps.push(question === undefined ? { trap: id } : { trap: id, question });
    left -= TRAPS[id].cost;
  }
  return traps;
}

/** The sticky note for a form: an answer for every question. Ratings avoid 3, which a backwards scale leaves in place. */
function noteFor(survey: MiwSurvey, rng: Rng): MiwAnswer[] {
  return survey.questions.map((q) => {
    switch (q.kind) {
      case "choice":
        return rng.int(q.options.length);
      case "rating":
        return rng.pick([1, 2, 4, 5]);
      case "number":
        // Never the very ends, where a slider starts.
        return q.min + 1 + rng.int(q.max - q.min - 1);
      case "consent":
        return rng.next() < 0.5;
    }
  });
}

/** Whether an answer fits its question's kind. */
function answerFits(q: MiwQuestion, a: MiwAnswer): boolean {
  if (a === null) return true;
  switch (q.kind) {
    case "choice":
      return typeof a === "number" && a < q.options.length;
    case "rating":
      return typeof a === "number" && a >= 1 && a <= 5;
    case "number":
      return typeof a === "number";
    case "consent":
      return typeof a === "boolean";
  }
}

function startRun(s: S, now: number) {
  const designerId = s.order[s.round]!;
  const form = s.forms[designerId]!;
  const rng = createRng((s.seed + Math.imul(s.round + 1, 0x9e3779b1)) >>> 0);
  s.run = {
    form: { designerId, traps: form.traps, auto: form.auto },
    answers: noteFor(s.survey, rng),
    fillers: active(s)
      .map((p) => p.id)
      .filter((id) => id !== designerId),
    startedAt: now,
    progress: {},
    submissions: {},
    result: null,
  };
  setPhase(s, "ready", now, READY_SECONDS);
}

/** Ends building: empty forms get random traps, and the forms to play are drawn. */
function endBuild(s: S, now: number) {
  const rng = createRng((s.seed ^ 0x5bd1e995) >>> 0);
  const designers = active(s).map((p) => p.id);
  for (const id of designers) {
    const form = (s.forms[id] ??= { traps: [], locked: false, auto: false });
    form.locked = true;
    if (!form.traps.length) {
      form.traps = randomForm(s.survey, rng.next);
      form.auto = true;
    }
  }
  s.order = rng
    .shuffle(designers)
    .slice(0, designers.length <= MIW_FORMS_PLAYED ? designers.length : MIW_FORMS_PLAYED);
  s.round = 0;
  if (!s.order.length) {
    s.phase = "done";
    return;
  }
  startRun(s, now);
}

function score(s: S, run: Run) {
  const limit = PLAY_SECONDS;
  // The form's usual length, so time the host added doesn't shrink everyone's seconds.
  const span = Math.max(1, s.phaseMs ?? s.phaseEndsAt - run.startedAt);
  const placed = run.form.traps;
  const fellBy = new Map<TrapId, Set<PlayerId>>(placed.map((t) => [t.trap, new Set()]));
  const players: MiwPlayerResult[] = [];
  let designerRaw = 0;
  for (const id of run.fillers) {
    const sub = run.submissions[id];
    if (!sub) {
      // Ran out of time: the whole limit counts, and so does whatever they were stuck on.
      designerRaw += limit * MIW_POINTS.second;
      const stuck = run.progress[id]?.stuck;
      if (stuck) fellBy.get(stuck)?.add(id);
      players.push({
        playerId: id,
        finished: false,
        seconds: limit,
        correct: 0,
        wrong: [],
        upsold: false,
        points: 0,
      });
      continue;
    }
    // Seconds on the form's own scale, so a test's pace doesn't change the scoring.
    const secs = Math.min(limit, Math.round(((sub.at - run.startedAt) / span) * limit));
    const wrong = s.survey.questions.flatMap((_, i) => (sub.answers[i] === run.answers[i] ? [] : [i]));
    const correct = s.survey.questions.length - wrong.length;
    for (const t of placed) {
      const info = TRAPS[t.trap];
      const fell = info.reading
        ? t.question !== undefined && wrong.includes(t.question)
        : t.trap === "confirmshame"
          ? sub.upsold
          : sub.fell.includes(t.trap);
      if (fell) fellBy.get(t.trap)?.add(id);
    }
    const finePrint = placed.filter(
      (t) => TRAPS[t.trap].reading && t.question !== undefined && !wrong.includes(t.question),
    ).length;
    if (finePrint) bumpStat(s.stats, id, "finePrint", finePrint);
    if (sub.upsold) bumpStat(s.stats, id, "upsold");
    const points = Math.max(
      0,
      correct * MIW_POINTS.correct +
        MIW_POINTS.finish +
        Math.round(MIW_POINTS.speed * Math.max(0, 1 - secs / limit)) -
        (sub.upsold ? MIW_POINTS.upsold : 0),
    );
    addPoints(s.points, id, points);
    designerRaw += (wrong.length + (sub.upsold ? 1 : 0)) * MIW_POINTS.wrong + secs * MIW_POINTS.second;
    players.push({ playerId: id, finished: true, seconds: secs, correct, wrong, upsold: sub.upsold, points });
  }
  const finishers = players.filter((p) => p.finished);
  const sued = finishers.length * 2 < run.fillers.length;
  const designerId = run.form.designerId;
  const designerPoints =
    sued || !run.fillers.length
      ? 0
      : Math.round((designerRaw * MIW_POINTS.fillersCounted) / run.fillers.length);
  if (designerPoints) {
    addPoints(s.points, designerId, designerPoints);
    bumpStat(s.stats, designerId, "darkLord", designerPoints);
  }
  if (sued) bumpStat(s.stats, designerId, "sued");
  const fastest = [...finishers].sort((a, b) => a.seconds - b.seconds)[0];
  if (fastest) bumpStat(s.stats, fastest.playerId, "escapes");
  run.result = {
    players: players.sort((a, b) => Number(b.finished) - Number(a.finished) || a.seconds - b.seconds),
    traps: placed.map((t) => ({ ...t, fellIds: [...(fellBy.get(t.trap) ?? [])] })),
    designerPoints,
    sued,
    fastestId: fastest?.playerId ?? null,
  };
}

function endPhase(s: S, now: number): Step<S> {
  switch (s.phase) {
    case "build":
      endBuild(s, now);
      return { state: s };
    case "ready":
      setPhase(s, "play", now, PLAY_SECONDS);
      s.run!.startedAt = now;
      return maybeAllIn(s, now);
    case "play":
      score(s, s.run!);
      setPhase(s, "reveal", now, REVEAL_SECONDS);
      return { state: s };
    case "reveal":
      if (s.round + 1 < s.order.length) {
        s.round += 1;
        startRun(s, now);
      } else if (galleryForms(s).length) {
        setPhase(s, "gallery", now, GALLERY_SECONDS);
      } else {
        s.phase = "done";
      }
      return { state: s };
    case "gallery":
      s.phase = "done";
      return { state: s };
    default:
      return { state: s };
  }
}

/** Play ends early once every filler still here has submitted. */
function maybeAllIn(s: S, now: number): Step<S> {
  const run = s.run;
  if (s.phase !== "play" || !run) return { state: s };
  if (run.fillers.every((id) => s.left.includes(id) || run.submissions[id])) return endPhase(s, now);
  return { state: s };
}

/** Building ends early once everyone still here has locked their form. */
function maybeAllBuilt(s: S, now: number): Step<S> {
  if (s.phase === "build" && active(s).every((p) => s.forms[p.id]?.locked)) return endPhase(s, now);
  return { state: s };
}

function galleryForms(s: S): MiwForm[] {
  return active(s)
    .filter((p) => !s.order.includes(p.id) && s.forms[p.id])
    .map((p) => ({ designerId: p.id, traps: s.forms[p.id]!.traps, auto: s.forms[p.id]!.auto }));
}

function act(s: S, playerId: PlayerId, action: MakeItWorseAction, now: number): Step<S> {
  if (s.left.includes(playerId) || !s.players.some((p) => p.id === playerId)) return { state: s };
  switch (action.type) {
    case "form": {
      const form = s.forms[playerId];
      if (s.phase !== "build" || !form || form.locked) return { state: s };
      const traps = action.traps.map((t) => (TRAPS[t.trap].target === "form" ? { trap: t.trap } : t));
      if (formProblem(s.survey, traps)) return { state: s };
      form.traps = traps;
      form.locked = !!action.lock;
      return maybeAllBuilt(s, now);
    }
    case "progress": {
      const run = s.run;
      if (s.phase !== "play" || !run?.fillers.includes(playerId) || run.submissions[playerId])
        return { state: s };
      run.progress[playerId] = {
        done: Math.min(action.done, miwCheckpoints(s.survey, run.form.traps) - 1),
        stuck: action.stuck && run.form.traps.some((t) => t.trap === action.stuck) ? action.stuck : null,
      };
      return { state: s };
    }
    case "submit": {
      const run = s.run;
      if (s.phase !== "play" || !run?.fillers.includes(playerId) || run.submissions[playerId])
        return { state: s };
      const answers = s.survey.questions.map((q, i) => {
        const a = action.answers[i] ?? null;
        return answerFits(q, a) ? a : null;
      });
      run.submissions[playerId] = { answers, fell: action.fell, upsold: action.upsold, at: now };
      run.progress[playerId] = { done: miwCheckpoints(s.survey, run.form.traps), stuck: null };
      return maybeAllIn(s, now);
    }
  }
}

export const makeItWorse: GameDefinition<S, MakeItWorseContent, MakeItWorseAction, MakeItWorseView> = {
  id: "make-it-worse",
  title: "Make It Worse",
  tagline: "Sabotage a survey with dark patterns, then race through everyone else's.",
  rules: [
    `Everyone gets the same short survey. Make it worse: put traps from the palette on its questions and its Submit button. You have ${MIW_BUDGET} points to spend, and each trap fits once.`,
    "Every trap has a trick that gets you past it: Tab, Esc, End, the arrow keys, reading twice. Mean is fine, impossible isn't.",
    "Then the forms are played one at a time. Everyone but the designer fills it in at once, with the answers on a sticky note, while the room watches the progress bars.",
    `Fillers score for every right answer and for finishing fast. The designer scores for every wrong answer and every second the form costs, but gets sued, and scores nothing, if fewer than half finish.`,
    `After each form, see who fell for which trap, its trick, and how a real form should do it. Big rooms play ${MIW_FORMS_PLAYED} random forms; the rest go to the gallery.`,
  ],
  categories: ["action"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 9,
  contentSchema: makeItWorseContentSchema,
  actionSchema: makeItWorseActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "make-it-worse", spice, count: 1, avoid }),
  contentIds: (content) => content.surveys.slice(0, 1).map((s) => s.id),

  init({ players, content, seed, now, pace }): Step<S> {
    const s: S = {
      players,
      left: [],
      phase: "build",
      phaseEndsAt: 0,
      survey: content.surveys[0]!,
      forms: Object.fromEntries(players.map((p) => [p.id, { traps: [], locked: false, auto: false }])),
      order: [],
      round: 0,
      run: null,
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    setPhase(s, "build", now, BUILD_SECONDS);
    return { state: s };
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return act(s, event.playerId, event.action as MakeItWorseAction, event.now);
      case "tick":
        return event.now >= s.phaseEndsAt ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left":
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        return s.phase === "build" ? maybeAllBuilt(s, event.now) : maybeAllIn(s, event.now);
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): MakeItWorseView {
    const playing = viewer !== null && s.players.some((p) => p.id === viewer);
    const run = s.run;
    const form = playing ? s.forms[viewer] : undefined;
    const building = s.phase === "build";
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.round,
      totalRounds: s.order.length || Math.min(active(s).length, MIW_FORMS_PLAYED),
      survey: s.survey,
      budget: MIW_BUDGET,
      myForm: form ? { traps: form.traps, locked: form.locked } : null,
      builders: building ? active(s).map((p) => p.id) : [],
      lockedIds: building
        ? active(s)
            .filter((p) => s.forms[p.id]?.locked)
            .map((p) => p.id)
        : [],
      run:
        run && !building
          ? {
              form: run.form,
              answers: run.answers,
              startedAt: run.startedAt,
              checkpoints: miwCheckpoints(s.survey, run.form.traps),
              fillers: run.fillers,
              progress: Object.fromEntries(
                run.fillers.map((id) => [
                  id,
                  {
                    done: run.progress[id]?.done ?? 0,
                    stuck: run.progress[id]?.stuck ?? null,
                    finished: !!run.submissions[id],
                  },
                ]),
              ),
              youFill: playing && run.fillers.includes(viewer),
              submitted: playing && !!run.submissions[viewer],
              result: run.result,
            }
          : null,
      gallery: s.phase === "gallery" || s.phase === "done" ? galleryForms(s) : [],
      points: s.points,
    };
  },

  deadline: (s) => (s.phase === "done" ? null : s.phaseEndsAt),
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
