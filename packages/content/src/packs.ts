import {
  createRng,
  type BotOrNotContent,
  type BrickBrawlContent,
  type ContentRequest,
  type DoodleChampionsContent,
  type DoodleSmashContent,
  type FakeArtistContent,
  type GameId,
  type HueClueContent,
  type InOrderContent,
  type MakeItWorseContent,
  type MiwSurvey,
  type PaintGrabContent,
  type Rng,
  type SkipLogicContent,
  type Spice,
  type SurveyQuestion,
  type SurveySaysContent,
  type WorstFeedbackContent,
} from "@brick/game";
import botOrNotPack from "../packs/bot-or-not.json" with { type: "json" };
import fakeArtistPack from "../packs/fake-artist.json" with { type: "json" };
import makeItWorsePack from "../packs/make-it-worse.json" with { type: "json" };
import skipLogicPack from "../packs/skip-logic.json" with { type: "json" };
import surveySaysPack from "../packs/survey-says.json" with { type: "json" };
import worstFeedbackPack from "../packs/worst-feedback.json" with { type: "json" };
import type { Style, Topic } from "./categories";

/** The most a pack file may weigh, tags included (DECISION-14). When content doesn't fit, the weakest items go. */
export const PACK_MAX_BYTES = 70_000;

/** A pack item with its spice level and its category (see categories.ts). */
type Tagged<T> = T & { spice: Spice; topic: Topic; style: Style };

export interface Packs {
  "worst-feedback": { prompts: Tagged<{ id: string; text: string }>[]; answers: Tagged<{ id: string; text: string }>[] };
  "bot-or-not": { pairs: Tagged<{ id: string; real: string; bot: string }>[] };
  "survey-says": { questions: Tagged<SurveyQuestion>[] };
  "skip-logic": { starters: Tagged<{ id: string; text: string }>[] };
  /** Spicy words are the harder ones to draw in a single line at a time. */
  "fake-artist": { words: Tagged<{ id: string; category: string; word: string }>[] };
  /** Plays without content. */
  "brick-brawl": Record<string, never>;
  /** Plays without content: the cards are numbers. */
  "in-order": Record<string, never>;
  /** Plays without content: players draw the fighters, and the stock commentary lives in the game. */
  "doodle-champions": Record<string, never>;
  /** Plays without content: the canvas is the content. */
  "paint-grab": Record<string, never>;
  /** Plays without content: the colour board is the content, and the players write the clues. */
  "hue-clue": Record<string, never>;
  /** Plays without content: the players draw the fighters. */
  "doodle-smash": Record<string, never>;
  /** The base surveys players sabotage: one per game (DECISION-22). */
  "make-it-worse": { surveys: Tagged<MiwSurvey>[] };
}

export const PACKS: Packs = {
  "worst-feedback": worstFeedbackPack as Packs["worst-feedback"],
  "bot-or-not": botOrNotPack as Packs["bot-or-not"],
  "survey-says": surveySaysPack as Packs["survey-says"],
  "skip-logic": skipLogicPack as Packs["skip-logic"],
  "fake-artist": fakeArtistPack as Packs["fake-artist"],
  "brick-brawl": {},
  "in-order": {},
  "doodle-champions": {},
  "paint-grab": {},
  "hue-clue": {},
  "doodle-smash": {},
  "make-it-worse": makeItWorsePack as Packs["make-it-worse"],
};

const strip = <T extends { spice: Spice; topic: Topic; style: Style }>({
  spice: _spice,
  topic: _topic,
  style: _style,
  ...rest
}: T): Omit<T, "spice" | "topic" | "style"> => rest;

/**
 * Picks `count` items: mild requests use only mild items, spicy requests alternate spicy and
 * mild. Ids in `avoid` are skipped while enough other items remain.
 */
export function selectItems<T extends { id: string; spice: Spice }>(
  items: T[],
  count: number,
  spice: Spice,
  avoid: string[],
  rng: Rng,
): T[] {
  const allowed = spice === "mild" ? items.filter((i) => i.spice === "mild") : items;
  const avoided = new Set(avoid);
  const fresh = allowed.filter((i) => !avoided.has(i.id));
  const pool = fresh.length >= count ? fresh : allowed;

  if (spice === "mild") return rng.shuffle(pool).slice(0, count);
  const spicy = rng.shuffle(pool.filter((i) => i.spice === "spicy"));
  const mild = rng.shuffle(pool.filter((i) => i.spice === "mild"));
  const picked: T[] = [];
  while (picked.length < count && (spicy.length || mild.length)) {
    const next = (picked.length % 2 === 0 ? spicy.shift() : mild.shift()) ?? spicy.shift() ?? mild.shift();
    if (next) picked.push(next);
  }
  return picked;
}

/** Questions spread across kinds (who, scale, choice), so a game gets variety. */
function selectQuestions(request: ContentRequest, rng: Rng): Tagged<SurveyQuestion>[] {
  const questions = PACKS["survey-says"].questions;
  const kinds = ["who", "scale", "choice"] as const;
  const perKind = kinds.map((kind) =>
    selectItems(
      questions.filter((q) => q.kind === kind),
      request.count,
      request.spice,
      request.avoid,
      rng,
    ),
  );
  const picked: Tagged<SurveyQuestion>[] = [];
  for (let i = 0; picked.length < request.count && perKind.some((qs) => qs.length > i); i++) {
    for (const qs of perKind) if (qs[i] && picked.length < request.count) picked.push(qs[i]!);
  }
  return rng.shuffle(picked);
}

export interface ContentByGame {
  "worst-feedback": WorstFeedbackContent;
  "bot-or-not": BotOrNotContent;
  "survey-says": SurveySaysContent;
  "skip-logic": SkipLogicContent;
  "fake-artist": FakeArtistContent;
  "brick-brawl": BrickBrawlContent;
  "in-order": InOrderContent;
  "doodle-champions": DoodleChampionsContent;
  "paint-grab": PaintGrabContent;
  "hue-clue": HueClueContent;
  "doodle-smash": DoodleSmashContent;
  "make-it-worse": MakeItWorseContent;
}

/** Content for a game built only from the hand-written packs. Always available, no network. */
export function packContent<G extends GameId>(request: ContentRequest & { gameId: G }, seed: number): ContentByGame[G];
export function packContent(request: ContentRequest, seed: number): ContentByGame[GameId] {
  const rng = createRng(seed);
  const { count, spice, avoid } = request;
  switch (request.gameId) {
    case "worst-feedback": {
      const pack = PACKS["worst-feedback"];
      return {
        prompts: selectItems(pack.prompts, count, spice, avoid, rng).map(strip),
        answers: selectItems(pack.answers, request.extraCount ?? count * 10, spice, avoid, rng).map(strip),
      };
    }
    case "bot-or-not":
      return { pairs: selectItems(PACKS["bot-or-not"].pairs, count, spice, avoid, rng).map(strip) };
    case "survey-says":
      return { questions: selectQuestions(request, rng).map((q) => strip(q) as SurveyQuestion) };
    case "skip-logic":
      return { starters: selectItems(PACKS["skip-logic"].starters, count, spice, avoid, rng).map(strip) };
    case "fake-artist":
      return { words: selectItems(PACKS["fake-artist"].words, count, spice, avoid, rng).map(strip) };
    case "brick-brawl":
      // No words at all: the arena is the content.
      return {};
    case "in-order":
      // Numbered cards, dealt by the game.
      return {};
    case "doodle-champions":
      // The players draw the fighters.
      return {};
    case "paint-grab":
      // No words at all: everyone paints one canvas.
      return {};
    case "hue-clue":
      // The board is made in code, and the players write the clues.
      return {};
    case "doodle-smash":
      // The players draw the fighters, and the stages are made in code.
      return {};
    case "make-it-worse":
      return { surveys: selectItems(PACKS["make-it-worse"].surveys, count, spice, avoid, rng).map(strip) };
  }
}
