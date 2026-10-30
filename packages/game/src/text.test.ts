import { describe, expect, test } from "vitest";
import { closeness, guessMatches, judgeChainsByKeywords, levenshtein, similarity } from "./text";

describe("levenshtein", () => {
  test.each([
    ["", "", 0],
    ["abc", "", 3],
    ["kitten", "sitting", 3],
    ["favorite", "favourite", 1],
    ["same", "same", 0],
  ])("%s -> %s is %i", (a, b, distance) => {
    expect(levenshtein(a, b)).toBe(distance);
    expect(levenshtein(b, a)).toBe(distance);
  });
});

describe("similarity", () => {
  test("ignores case, accents and punctuation", () => {
    expect(similarity("Café, please!", "cafe please")).toBe(1);
  });

  test("is 0 for empty text", () => {
    expect(similarity("", "")).toBe(0);
  });
});

describe("guessMatches", () => {
  const real = "What's your favorite snack during standup?";

  test("accepts the same question with typos", () => {
    expect(guessMatches(real, "whats ur favourite snak during standup")).toBe(true);
  });

  test("accepts a near-identical answer written as one blob", () => {
    expect(guessMatches("Coffee or tea", "coffe or tea")).toBe(true);
  });

  test("rejects a different topic", () => {
    expect(guessMatches(real, "How many monitors do you have?")).toBe(false);
  });

  test("rejects an empty guess", () => {
    expect(guessMatches(real, "   ")).toBe(false);
  });
});

describe("closeness", () => {
  test("scores identical text 10 and unrelated text 0", () => {
    expect(closeness("A cat riding a skateboard", "a cat riding a skateboard")).toBe(10);
    expect(closeness("A cat riding a skateboard", "Pizza in space")).toBe(0);
  });

  test("forgives typos in keywords", () => {
    expect(closeness("A giraffe eating spaghetti", "a girafe eating spagetti")).toBeGreaterThanOrEqual(8);
  });

  test("doesn't treat one swapped keyword as nailing it", () => {
    expect(closeness("What's your favorite snack?", "What's your favorite drink?")).toBeLessThan(8);
  });

  test("short words need an exact match", () => {
    expect(closeness("a cat", "a car")).toBe(0);
  });
});

describe("judgeChainsByKeywords", () => {
  test("judges every hop and chain without Claude", () => {
    const result = judgeChainsByKeywords({
      chains: [
        {
          chain: 0,
          original: "A dog flying a kite",
          final: "a dog flyng a kyte",
          hops: [{ entry: 2, drawn: "A dog flying a kite", guess: "dog flyng kite" }],
        },
      ],
    });
    expect(result.judgedBy).toBe("keywords");
    expect(result.hops).toEqual([{ chain: 0, entry: 2, closeness: 10 }]);
    expect(result.chains[0]!.drift).toBe(0);
  });
});
