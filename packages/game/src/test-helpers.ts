import type { BotOrNotContent } from "./games/bot-or-not";
import type { FakeArtistContent } from "./games/fake-artist";
import type { MakeItWorseContent } from "./games/make-it-worse";
import type { SkipLogicContent } from "./games/skip-logic";
import type { SurveySaysContent } from "./games/survey-says";
import type { WorstFeedbackContent } from "./games/worst-feedback";
import type { GameId, PlayerInfo } from "./types";

export const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, avatar: { color: "teal", hat: "none", face: "classic", shape: "brick" } }));

export const fixtures = {
  "worst-feedback": {
    prompts: Array.from({ length: 5 }, (_, i) => ({ id: `wp${i}`, text: `Prompt ${i} about ____` })),
    answers: Array.from({ length: 80 }, (_, i) => ({ id: `wa${i}`, text: `Answer card ${i}.` })),
  } satisfies WorstFeedbackContent,
  "bot-or-not": {
    pairs: Array.from({ length: 5 }, (_, i) => ({
      id: `bp${i}`,
      real: `What would you bring to a desert island number ${i}?`,
      bot: `What would you bring to a job interview number ${i}?`,
    })),
  } satisfies BotOrNotContent,
  "survey-says": {
    questions: [
      { id: "s1", kind: "who", text: "Who deploys on Fridays?" },
      { id: "s2", kind: "scale", text: "Pineapple on pizza?", minLabel: "Crime", maxLabel: "Art" },
      { id: "s3", kind: "choice", text: "Tabs or spaces?", options: ["Tabs", "Spaces"] },
      { id: "s4", kind: "who", text: "Who has the most tabs open?" },
      { id: "s5", kind: "choice", text: "Coffee or tea?", options: ["Coffee", "Tea", "Water"] },
      { id: "s6", kind: "scale", text: "How awake are you?", minLabel: "Zombie", maxLabel: "Espresso" },
    ],
  } satisfies SurveySaysContent,
  "skip-logic": {
    starters: Array.from({ length: 30 }, (_, i) => ({ id: `st${i}`, text: `Starter question ${i}?` })),
  } satisfies SkipLogicContent,
  "fake-artist": {
    words: [
      { id: "fw1", category: "Animals", word: "Giraffe" },
      { id: "fw2", category: "Food", word: "Pizza" },
      { id: "fw3", category: "Vehicles", word: "Bicycle" },
    ],
  } satisfies FakeArtistContent,
  "brick-brawl": {},
  "in-order": {},
  "doodle-champions": {},
  "paint-grab": {},
  "hue-clue": {},
  "doodle-smash": {},
  "make-it-worse": {
    surveys: [
      {
        id: "mw-test",
        title: "Lunch survey",
        intro: "Tell us about lunch.",
        questions: [
          { kind: "choice", label: "Lunch", text: "What did you have for lunch?", options: ["Soup", "Salad", "Noodles"] },
          { kind: "rating", label: "Taste", text: "How did it taste?", low: "Awful", high: "Amazing" },
          { kind: "number", label: "Bites", text: "How many bites did it take?", min: 1, max: 60, unit: "bites" },
          { kind: "consent", label: "Newsletter", text: "Email me the lunch newsletter", thing: "the lunch newsletter" },
        ],
      },
    ],
  } satisfies MakeItWorseContent,
} satisfies Record<GameId, unknown>;
