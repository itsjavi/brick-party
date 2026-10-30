import type { JudgeChainsInput, JudgeChainsResult } from "./engine";

const STOPWORDS = new Set(
  "a an the of to in on at for with and or but is are was were be been your you yours my me i we our it its this that what which who whom whose how why when where would could should do does did from by as than then into out up about most least best worst some any one".split(
    " ",
  ),
);

/** Whole answers at least this similar count as the same answer, typos and all. */
const NEAR_IDENTICAL = 0.9;
/** Longer texts are cut before the edit distance, which grows with the square of the length. */
const MAX_COMPARED_CHARS = 200;

/** Lowercase letters, digits and single spaces; accents and punctuation dropped. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .map((w) => w.replace(/s$/, ""))
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/** Edit distance: the fewest single-character insertions, deletions or substitutions from `a` to `b`. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** Two words are the same despite a typo: one edit allowed from 4 letters, two from 8. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  const allowed = longest >= 8 ? 2 : longest >= 4 ? 1 : 0;
  return allowed > 0 && Math.abs(a.length - b.length) <= allowed && levenshtein(a, b) <= allowed;
}

/** How many words of `x` appear in `y`, exact matches first, each word of `y` used once. */
function sharedWords(x: Set<string>, y: Set<string>): number {
  const unused = new Set(y);
  const unmatched: string[] = [];
  for (const w of x) {
    if (unused.delete(w)) continue;
    unmatched.push(w);
  }
  let shared = x.size - unmatched.length;
  for (const w of unmatched) {
    const match = [...unused].find((v) => sameWord(w, v));
    if (match === undefined) continue;
    unused.delete(match);
    shared++;
  }
  return shared;
}

/** 0 to 1: how alike two whole texts are, from their edit distance. */
export function similarity(a: string, b: string): number {
  const x = normalize(a).slice(0, MAX_COMPARED_CHARS);
  const y = normalize(b).slice(0, MAX_COMPARED_CHARS);
  const longest = Math.max(x.length, y.length);
  return longest ? 1 - levenshtein(x, y) / longest : 0;
}

/**
 * 0-10 overlap of two texts' keywords (Dice coefficient), counting words a typo apart as the
 * same. Near-identical texts score by their whole-text similarity instead.
 */
export function closeness(a: string, b: string): number {
  const x = keywords(a);
  const y = keywords(b);
  const dice = x.size && y.size ? (2 * sharedWords(x, y)) / (x.size + y.size) : 0;
  const whole = similarity(a, b);
  return Math.round(Math.max(dice, whole >= NEAR_IDENTICAL ? whole : 0) * 10);
}

const DRIFT_QUIPS = [
  "Shockingly accurate. Are you all the same person?",
  "Close-ish. The survey team is mildly concerned.",
  "Somewhere along the way, this survey took a wrong turn.",
  "This is no longer a survey. This is modern art.",
];

/** The Skip Logic judge without Claude: fuzzy keyword overlap and a canned verdict. */
export function judgeChainsByKeywords(input: JudgeChainsInput): JudgeChainsResult {
  return {
    hops: input.chains.flatMap((c) =>
      c.hops.map((h) => ({ chain: c.chain, entry: h.entry, closeness: closeness(h.drawn, h.guess) })),
    ),
    chains: input.chains.map((c) => {
      const drift = 10 - closeness(c.original, c.final);
      return { chain: c.chain, drift, quip: DRIFT_QUIPS[Math.min(3, Math.floor(drift / 3))]! };
    }),
    judgedBy: "keywords",
  };
}

/**
 * Judges a Bot's guess of the real question without Claude: the guess is nearly the same text,
 * or has at least half of the real question's keywords, allowing for typos.
 */
export function guessMatches(realQuestion: string, guess: string): boolean {
  if (similarity(realQuestion, guess) >= NEAR_IDENTICAL) return true;
  const real = keywords(realQuestion);
  const guessed = keywords(guess);
  if (real.size === 0 || guessed.size === 0) return false;
  return sharedWords(real, guessed) / real.size >= 0.5;
}
