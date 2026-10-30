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
import { HUE_CELLS, parseCell, ringDistance } from "./hue-grid";
import { botClue } from "./hue-words";

/**
 * Hue Clue: a colour game like Hues and Cues. Each round one player sees a secret cell on a big grid of colours and
 * gives a clue of a word or two; everyone else puts a pin on the cell they think it is, and may move it until time
 * runs out or they lock it in. Closer pins score more, and the clue-giver scores for every pin close by. Pins stay
 * hidden until the reveal, so nobody can follow the crowd.
 */

const CLUE_SECONDS = 30;
const GUESS_SECONDS = 25;
const REVEAL_SECONDS = 9;
/** Rooms this small go round twice, so everyone gives two clues. */
const SMALL_ROOM = 4;
/** A new target is at least this many rings from earlier ones, when the board allows. */
const TARGET_SPREAD = 3;
/** Pins this many rings or more from the target count as way off, for the awards. */
const WAY_OFF_RINGS = 5;
export const HUE_CLUE_MAX_CLUE = 24;

export const HUE_CLUE_POINTS = {
  /** For a guesser, by rings from the target: on it, one ring off, two rings off. Further scores nothing. */
  guess: [300, 200, 100],
  /** For the clue-giver, for each pin by rings from the target: on it or one ring off, or two rings off. */
  giver: [100, 100, 50],
} as const;

export const hueClueContentSchema = z.object({});
export type HueClueContent = z.infer<typeof hueClueContentSchema>;

/** Basic colour words in English, which a clue can't use, and number words, which it can't either. */
const COLOUR_WORDS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "violet",
  "pink",
  "brown",
  "black",
  "white",
  "grey",
  "gray",
  "cyan",
  "magenta",
  "teal",
  "turquoise",
  "indigo",
  "beige",
  "maroon",
  "navy",
  "aqua",
  "fuchsia",
  "scarlet",
  "crimson",
  "colour",
  "color",
];
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * A clue as everyone sees it: punctuation dropped ("melon!" is just "melon"), single spaces, no padding. Digits stay,
 * so "No numbers" can still catch them.
 */
const tidy = (text: string) =>
  text
    .replace(/[^\p{L}\p{M}\p{N}'’\s-]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

/** Why a clue isn't allowed, or `null` when it's fine: a word or two, no colour names, no numbers. */
export function clueProblem(text: string): string | null {
  const clue = tidy(text);
  if (!clue) return "Type a clue.";
  if (clue.length > HUE_CLUE_MAX_CLUE) return `Keep it short: ${HUE_CLUE_MAX_CLUE} characters at most.`;
  if (/\p{N}/u.test(clue)) return "No numbers.";
  const words = clue.split(" ");
  if (words.length > 2) return "One or two words.";
  if (!words.every((w) => /^[\p{L}\p{M}'’-]+$/u.test(w))) return "Letters only.";
  for (const word of words.flatMap((w) => w.split("-"))) {
    const plain = word.toLowerCase().replace(/['’]s?$/, "");
    const base = plain.replace(/(dish|ish|ey|y|s)$/, "");
    if ([plain, base, `${base}e`].some((w) => COLOUR_WORDS.includes(w))) return "No colour names.";
    if (NUMBER_WORDS.includes(plain)) return "No numbers.";
  }
  return null;
}


/** A cell as an index (0 is A1, top left, row by row) or as a board label like "F4". */
const cellSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const cell =
    typeof value === "string"
      ? parseCell(value)
      : Number.isInteger(value) && value >= 0 && value < HUE_CELLS
        ? value
        : null;
  if (cell === null) {
    ctx.addIssue({
      code: "custom",
      message: `A cell is a column A-P and a row 1-10, like "F4", or an index from 0 to ${HUE_CELLS - 1}.`,
    });
    return z.NEVER;
  }
  return cell;
});

export const hueClueActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("clue"),
    text: z
      .string()
      .max(60)
      .superRefine((text, ctx) => {
        const problem = clueProblem(text);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
  }),
  /** Puts (or moves) your pin; `lock` makes it final. */
  z.object({ type: z.literal("guess"), cell: cellSchema, lock: z.boolean().optional() }),
]);
export type HueClueAction = z.infer<typeof hueClueActionSchema>;

type Phase = "clue" | "guess" | "reveal" | "done";

export interface HueCluePin {
  cell: number;
  locked: boolean;
}

export interface HueClueRound {
  giverId: PlayerId;
  target: number;
  clue: string | null;
  /** The clue-giver ran out of time and the house gave the clue (and the giver scores nothing for it). */
  autoClue: boolean;
  pins: Record<PlayerId, HueCluePin>;
  /** What the round paid, once it's revealed. */
  points: Record<PlayerId, number>;
  /** The clue-giver left before giving a clue, so the round never happened. */
  skipped: boolean;
}

export interface HueClueState {
  players: PlayerInfo[];
  left: PlayerId[];
  phase: Phase;
  phaseEndsAt: number;
  /** How long the current phase was given; the host's "+N s" button adds this much again. */
  phaseMs?: number;
  roundIndex: number;
  rounds: HueClueRound[];
  points: Record<PlayerId, number>;
  stats: GameStats;
  pace: number;
  seed: number;
}

export interface HueClueRevealPin {
  playerId: PlayerId;
  cell: number;
  rings: number;
  points: number;
}

export interface HueClueView {
  phase: Phase;
  endsAt: number;
  round: number;
  totalRounds: number;
  giverId: PlayerId;
  /** Whether you give this round's clue; `null` for spectators. */
  youGive: boolean | null;
  /** The secret cell: only the clue-giver sees it before the reveal. */
  target: number | null;
  clue: string | null;
  autoClue: boolean;
  /** Your pin this round, if you've put one down. */
  myPin: HueCluePin | null;
  /** Who guesses this round (everyone still here but the clue-giver). */
  guessers: PlayerId[];
  /** Who has a pin down, and who has locked theirs in. Never where. */
  placedIds: PlayerId[];
  lockedIds: PlayerId[];
  /** Everyone's pins and points, once the round is revealed. */
  reveal: {
    target: number;
    pins: HueClueRevealPin[];
    giverPoints: number;
  } | null;
  /** Earlier rounds' clues and targets, for the board's memory. */
  past: { giverId: PlayerId; clue: string; target: number }[];
  points: Record<PlayerId, number>;
}

type S = HueClueState;

const active = (s: S) => s.players.filter((p) => !s.left.includes(p.id));
const current = (s: S) => s.rounds[s.roundIndex]!;
const guessersOf = (s: S, round: HueClueRound) =>
  active(s)
    .filter((p) => p.id !== round.giverId)
    .map((p) => p.id);

function setPhase(s: S, phase: Phase, now: number, secs: number) {
  s.phase = phase;
  s.phaseMs = seconds(s.pace, secs);
  s.phaseEndsAt = now + s.phaseMs;
}

function deadline(s: S): number | null {
  if (s.phase === "done") return null;
  if (s.phase === "reveal") return s.phaseEndsAt;
  return s.phaseEndsAt + GRACE_MS;
}

/** Starts the round at `from`, skipping rounds whose clue-giver has left, or ends the game after the last. */
function startRound(s: S, now: number, from: number): Step<S> {
  let index = from;
  while (index < s.rounds.length && s.left.includes(s.rounds[index]!.giverId)) {
    s.rounds[index]!.skipped = true;
    index++;
  }
  if (index >= s.rounds.length) {
    s.roundIndex = Math.max(0, Math.min(from, s.rounds.length) - 1);
    // The last round that happened stays on screen.
    while (s.roundIndex > 0 && s.rounds[s.roundIndex]!.skipped) s.roundIndex--;
    s.phase = "done";
    return { state: s };
  }
  s.roundIndex = index;
  setPhase(s, "clue", now, CLUE_SECONDS);
  return { state: s };
}

function giveClue(s: S, text: string, auto: boolean, now: number): Step<S> {
  const round = current(s);
  round.clue = text;
  round.autoClue = auto;
  setPhase(s, "guess", now, GUESS_SECONDS);
  return maybeReveal(s, now);
}

function reveal(s: S, now: number): Step<S> {
  const round = current(s);
  for (const [playerId, pin] of Object.entries(round.pins)) {
    const rings = ringDistance(pin.cell, round.target);
    const pts = HUE_CLUE_POINTS.guess[rings] ?? 0;
    if (pts) addPoints(round.points, playerId, pts);
    if (rings === 0) bumpStat(s.stats, playerId, "bullseyes");
    if (rings >= WAY_OFF_RINGS) bumpStat(s.stats, playerId, "wayOff");
    const giverPts = round.autoClue ? 0 : (HUE_CLUE_POINTS.giver[rings] ?? 0);
    if (giverPts) addPoints(round.points, round.giverId, giverPts);
    if (!round.autoClue && rings <= 1) bumpStat(s.stats, round.giverId, "clueHits");
  }
  for (const [playerId, pts] of Object.entries(round.points)) addPoints(s.points, playerId, pts);
  setPhase(s, "reveal", now, REVEAL_SECONDS);
  return { state: s };
}

/** Reveals early once everyone guessing has locked in. */
function maybeReveal(s: S, now: number): Step<S> {
  const round = current(s);
  if (s.phase === "guess" && guessersOf(s, round).every((id) => round.pins[id]?.locked))
    return reveal(s, now);
  return { state: s };
}

function endPhase(s: S, now: number): Step<S> {
  const round = current(s);
  switch (s.phase) {
    case "clue": {
      // Out of time: the house gives a clue, so the round still happens.
      const rng = createRng((s.seed ^ Math.imul(s.roundIndex + 1, 0x9e3779b1)) >>> 0);
      return giveClue(s, botClue(round.target, rng.next), true, now);
    }
    case "guess":
      // Pins still down count, locked or not.
      return reveal(s, now);
    case "reveal":
      return startRound(s, now, s.roundIndex + 1);
    default:
      return { state: s };
  }
}

function handleAction(s: S, playerId: PlayerId, action: HueClueAction, now: number): Step<S> {
  if (!active(s).some((p) => p.id === playerId)) return { state: s };
  const round = current(s);
  switch (action.type) {
    case "clue":
      if (s.phase !== "clue" || playerId !== round.giverId || clueProblem(action.text)) return { state: s };
      return giveClue(s, tidy(action.text), false, now);
    case "guess": {
      if (s.phase !== "guess" || playerId === round.giverId) return { state: s };
      if (round.pins[playerId]?.locked) return { state: s };
      round.pins[playerId] = { cell: action.cell, locked: !!action.lock };
      return maybeReveal(s, now);
    }
  }
}

/** Random targets, each kept a few rings from the earlier ones so rounds feel different. */
function pickTargets(count: number, rng: ReturnType<typeof createRng>): number[] {
  const targets: number[] = [];
  for (let i = 0; i < count; i++) {
    let cell = rng.int(HUE_CELLS);
    for (let tries = 0; tries < 30 && targets.some((t) => ringDistance(t, cell) < TARGET_SPREAD); tries++) {
      cell = rng.int(HUE_CELLS);
    }
    targets.push(cell);
  }
  return targets;
}

export const hueClue: GameDefinition<S, HueClueContent, HueClueAction, HueClueView> = {
  id: "hue-clue",
  title: "Hue Clue",
  tagline: "One secret colour, one tiny clue. Tap the right shade.",
  rules: [
    "Each round, one player secretly gets a colour on the big board and gives a clue of one or two words.",
    "House rule: no colour names and no numbers. Think things: banana, lava, ocean, plum.",
    "Everyone else taps the cell they think it is. Move your pin until time runs out, or lock it in.",
    `On the colour +${HUE_CLUE_POINTS.guess[0]}, one ring away +${HUE_CLUE_POINTS.guess[1]}, two rings away +${HUE_CLUE_POINTS.guess[2]}. The clue-giver gets +${HUE_CLUE_POINTS.giver[1]} for every pin within one ring, and +${HUE_CLUE_POINTS.giver[2]} for two rings away.`,
    "Everyone gives a clue once, or twice in rooms of four or fewer.",
  ],
  categories: ["guessing"],
  minPlayers: 3,
  maxPlayers: 12,
  minutes: 7,
  contentSchema: hueClueContentSchema,
  actionSchema: hueClueActionSchema,
  contentRequest: (_playerCount, spice, avoid) => ({ gameId: "hue-clue", spice, count: 0, avoid }),
  contentIds: () => [],

  init({ players, seed, now, pace }): Step<S> {
    const rng = createRng(seed);
    const laps = players.length <= SMALL_ROOM ? 2 : 1;
    const order = rng.shuffle(players.map((p) => p.id));
    const givers = Array.from({ length: laps }, () => order).flat();
    const targets = pickTargets(givers.length, rng);
    const s: S = {
      players,
      left: [],
      phase: "clue",
      phaseEndsAt: 0,
      roundIndex: 0,
      rounds: givers.map((giverId, i) => ({
        giverId,
        target: targets[i]!,
        clue: null,
        autoClue: false,
        pins: {},
        points: {},
        skipped: false,
      })),
      points: zeroPoints(players),
      stats: {},
      pace,
      seed,
    };
    return startRound(s, now, 0);
  },

  reduce(state, event: GameEvent): Step<S> {
    const s = structuredClone(state);
    if (s.phase === "done") return { state: s };
    switch (event.type) {
      case "action":
        return handleAction(s, event.playerId, event.action as HueClueAction, event.now);
      case "tick":
        return event.now >= deadline(s)! ? endPhase(s, event.now) : { state: s };
      case "skip":
        return endPhase(s, event.now);
      case "player_left": {
        if (!s.left.includes(event.playerId)) s.left.push(event.playerId);
        const round = current(s);
        // A clue-giver who leaves before giving the clue takes the round with them.
        if (s.phase === "clue" && round.giverId === event.playerId) {
          round.skipped = true;
          return startRound(s, event.now, s.roundIndex + 1);
        }
        return maybeReveal(s, event.now);
      }
      case "effect_result":
        return { state: s };
    }
  },

  view(s, viewer): HueClueView {
    const round = current(s);
    const isPlayer = viewer !== null && s.players.some((p) => p.id === viewer);
    const revealed = s.phase === "reveal" || s.phase === "done";
    const gives = isPlayer && viewer === round.giverId;
    const pins = Object.entries(round.pins);
    return {
      phase: s.phase,
      endsAt: s.phaseEndsAt,
      round: s.roundIndex,
      totalRounds: s.rounds.length,
      giverId: round.giverId,
      youGive: isPlayer ? gives : null,
      target: revealed || gives ? round.target : null,
      clue: round.clue,
      autoClue: round.autoClue,
      myPin: viewer ? (round.pins[viewer] ?? null) : null,
      guessers: guessersOf(s, round),
      placedIds: pins.map(([id]) => id),
      lockedIds: pins.filter(([, p]) => p.locked).map(([id]) => id),
      reveal: revealed
        ? {
            target: round.target,
            pins: pins
              .map(([playerId, pin]) => ({
                playerId,
                cell: pin.cell,
                rings: ringDistance(pin.cell, round.target),
                points: round.points[playerId] ?? 0,
              }))
              .sort((a, b) => a.rings - b.rings),
            giverPoints: round.points[round.giverId] ?? 0,
          }
        : null,
      past: s.rounds
        .slice(0, revealed ? s.roundIndex + 1 : s.roundIndex)
        .filter((r) => !r.skipped && r.clue !== null)
        .map((r) => ({ giverId: r.giverId, clue: r.clue!, target: r.target })),
      points: s.points,
    };
  },

  deadline,
  isOver: (s) => s.phase === "done",
  scores: (s) => s.points,
  stats: (s) => s.stats,
};
