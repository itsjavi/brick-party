import type { GameDefinition } from "../engine";
import type { GameId } from "../types";
import { botOrNot } from "./bot-or-not";
import { brickBrawl } from "./brick-brawl";
import { doodleChampions } from "./doodle-champions";
import { doodleSmash } from "./doodle-smash";
import { fakeArtist } from "./fake-artist";
import { hueClue } from "./hue-clue";
import { inOrder } from "./in-order";
import { makeItWorse } from "./make-it-worse";
import { paintGrab } from "./paint-grab";
import { skipLogic } from "./skip-logic";
import { surveySays } from "./survey-says";
import { worstFeedback } from "./worst-feedback";

export const GAMES: Record<GameId, GameDefinition> = {
  "worst-feedback": worstFeedback,
  "bot-or-not": botOrNot,
  "survey-says": surveySays,
  "skip-logic": skipLogic,
  "fake-artist": fakeArtist,
  "brick-brawl": brickBrawl,
  "in-order": inOrder,
  "doodle-champions": doodleChampions,
  "paint-grab": paintGrab,
  "hue-clue": hueClue,
  "doodle-smash": doodleSmash,
  "make-it-worse": makeItWorse,
};

export * from "./bot-or-not";
export * from "./brick-brawl";
export * from "./doodle-champions";
export * from "./doodle-fighter";
export * from "./doodle-smash";
export * from "./fake-artist";
export * from "./hue-clue";
export * from "./hue-grid";
export * from "./hue-words";
export * from "./in-order";
export * from "./make-it-worse";
export * from "./paint-grab";
export * from "./skip-logic";
export * from "./smash-input";
export * from "./smash-sim";
export * from "./survey-says";
export * from "./worst-feedback";
