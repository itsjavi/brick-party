import {
  HUE_CELLS,
  HUE_LAB,
  cellAt,
  cellX,
  cellY,
  hexToOklab,
  labDistance,
  nearestCell,
  ringDistance,
} from "./hue-grid";

/**
 * Everyday things and the colour most people picture for them, so bots can play Hue Clue without Claude: a bot giving
 * the clue names the thing closest to its colour, and a bot guessing taps where the clue's thing sits on the board.
 * Things, never colour names, and known the world over.
 */
export const HUE_WORDS: Record<string, string> = {
  // Reds and pinks
  tomato: "#e5402b",
  cherry: "#b0122b",
  strawberry: "#e8344e",
  ketchup: "#c8261b",
  lobster: "#d6402c",
  firetruck: "#d9201c",
  ruby: "#b3123c",
  wine: "#6d1a36",
  jam: "#9b1b3a",
  beetroot: "#8e1f4f",
  raspberry: "#c7275e",
  watermelon: "#f0536b",
  flamingo: "#f48fb1",
  bubblegum: "#ff8fcf",
  piglet: "#f7b3c2",
  blush: "#fbd3d8",
  ballet: "#f9dde3",
  mahogany: "#4c0d14",
  salmon: "#f58c76",
  // Oranges and browns
  lava: "#e2401a",
  sunset: "#f2784b",
  pumpkin: "#f07b16",
  carrot: "#ee7a1f",
  tiger: "#f08a24",
  mango: "#ffb43a",
  apricot: "#f8b878",
  peach: "#fdc39a",
  rust: "#a0461c",
  brick: "#a4402a",
  fox: "#d8692a",
  cinnamon: "#a85a2a",
  terracotta: "#c46a4a",
  coffee: "#6b4226",
  chocolate: "#5a3220",
  bark: "#4e3626",
  caramel: "#c47f2c",
  toast: "#c98a4b",
  peanut: "#c99a5b",
  camel: "#c19a6b",
  // Yellows
  honey: "#e8a92a",
  mustard: "#d4a017",
  sunflower: "#f5c518",
  yolk: "#f6b51e",
  banana: "#f5e050",
  lemon: "#fff44f",
  duckling: "#ffe066",
  corn: "#f2d84b",
  butter: "#f8e9a1",
  vanilla: "#f6edc6",
  sand: "#e2c999",
  cream: "#ffe8cf",
  // Greens
  lime: "#9ccc2e",
  kiwi: "#8dbb3a",
  pea: "#8fbf4a",
  celery: "#c6e08a",
  pistachio: "#c2dca0",
  olive: "#7d7a2a",
  pickle: "#6e8b2e",
  avocado: "#5e7f2a",
  moss: "#5f7a2b",
  grass: "#4fa82a",
  frog: "#4cae3c",
  leaf: "#3f9b2f",
  spinach: "#2f5e22",
  forest: "#1f5a2e",
  jungle: "#1d6b35",
  pine: "#1e4d3a",
  emerald: "#1e9e63",
  jade: "#2fa37a",
  mint: "#a8e6c1",
  // Blues
  lagoon: "#29a3a6",
  peacock: "#0f7f8a",
  sea: "#2a9da8",
  pool: "#4fd0e0",
  glacier: "#a9e2ee",
  ice: "#d2f1f8",
  sky: "#7cc3f0",
  cornflower: "#5f86f0",
  spruce: "#0d4d5a",
  denim: "#3c5f9e",
  ocean: "#1f5f9e",
  sapphire: "#1d4fb8",
  blueberry: "#3d4fa8",
  midnight: "#1b2350",
  night: "#1f2452",
  cloud: "#e6eef8",
  snow: "#f1f5fb",
  // Purples
  lavender: "#c8b2e8",
  lilac: "#dcc6f0",
  hyacinth: "#9b8ff0",
  amethyst: "#8e5ac7",
  iris: "#5a4fcf",
  grape: "#6a2f8a",
  plum: "#7d2e6b",
  eggplant: "#4b1d47",
  bruise: "#5b3a78",
  orchid: "#c64fb5",
  berry: "#8b2a6b",
};

const WORD_LAB = Object.fromEntries(Object.entries(HUE_WORDS).map(([word, hex]) => [word, hexToOklab(hex)]));
/** Where each word sits on the board: the cell closest to its colour. */
export const HUE_WORD_CELLS: Record<string, number> = Object.fromEntries(
  Object.entries(HUE_WORDS).map(([word, hex]) => [word, nearestCell(hex)]),
);

/** Lowercase, no accents, and a plural "s" or "es" dropped, so "Cherries" finds "cherry". */
function stems(word: string): string[] {
  const plain = word
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  return [plain, plain.replace(/ies$/, "y"), plain.replace(/es$/, ""), plain.replace(/s$/, "")];
}

/** The known word in a clue, if any (the last one wins: "ripe banana" is a banana). */
export function knownWord(clue: string): string | null {
  const words = clue.split(/[\s-]+/).reverse();
  for (const w of words) for (const stem of stems(w)) if (stem in HUE_WORDS) return stem;
  return null;
}

/** Words that nudge a guess lighter or darker, in a two-word clue like "dark cherry". */
const LIGHTER = ["light", "pale", "baby", "soft", "pastel", "faded", "misty"];
const DARKER = ["dark", "deep", "rich", "burnt", "night", "shadow", "old"];

/**
 * A bot's clue for a target cell: one of the few things whose colour sits closest to it on the board, picked with
 * `random`, so the same colour doesn't always get the same word.
 */
export function botClue(target: number, random: () => number = Math.random): string {
  const scored = Object.keys(HUE_WORDS).map((word) => ({
    word,
    rings: ringDistance(HUE_WORD_CELLS[word]!, target),
    shade: labDistance(WORD_LAB[word]!, HUE_LAB[target]!),
  }));
  scored.sort((a, b) => a.rings - b.rings || a.shade - b.shade);
  const best = scored[0]!.rings;
  const close = scored.filter((s) => s.rings === best).slice(0, 3);
  const pick = close[Math.floor(random() * close.length)]!;
  // A word that sits a couple of rows off gets a nudge, the way people say "dark cherry".
  const dy = cellY(target) - cellY(HUE_WORD_CELLS[pick.word]!);
  if (dy >= 2) return `dark ${pick.word}`;
  if (dy <= -2) return `pale ${pick.word}`;
  return pick.word;
}

/**
 * A bot's guess for a clue: where the clue's thing sits on the board, nudged by "dark" or "pale", give or take a
 * cell. A clue the bot doesn't know gets a random cell.
 */
export function botGuess(clue: string, random: () => number = Math.random): number {
  const word = knownWord(clue);
  if (!word) return Math.floor(random() * HUE_CELLS);
  const at = HUE_WORD_CELLS[word]!;
  const words = clue.toLowerCase().split(/[\s-]+/);
  const shift = words.some((w) => DARKER.includes(w)) ? 2 : words.some((w) => LIGHTER.includes(w)) ? -2 : 0;
  // Most guesses land on the spot, some a cell off in any direction.
  const wobble = () => (random() < 0.65 ? 0 : random() < 0.5 ? -1 : 1);
  return cellAt(cellX(at) + wobble(), cellY(at) + shift + wobble());
}

/** How many of the board's cells have a known word within a ring, for tests. */
export function wordCoverage(): number {
  let covered = 0;
  for (let cell = 0; cell < HUE_CELLS; cell++) {
    if (Object.values(HUE_WORD_CELLS).some((at) => ringDistance(at, cell) <= 1)) covered++;
  }
  return covered / HUE_CELLS;
}
