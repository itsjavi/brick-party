import { GAMES, GAME_IDS, type ContentRequest, type GameId, type Spice } from "@brick/game";
import { statSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { aiAvailable, buildContent, estimateCost } from "./ai";
import { STYLES, TOPICS } from "./categories";
import { PACK_MAX_BYTES, PACKS, packContent } from "./packs";

const request = <G extends GameId>(gameId: G, count: number, spice: Spice, avoid: string[] = []): ContentRequest & { gameId: G } => ({
  gameId,
  spice,
  count,
  extraCount: gameId === "worst-feedback" ? count * 20 : undefined,
  avoid,
});

type PackItem = { id: string; spice: Spice; topic: string; style: string };
const allPackItems = (): PackItem[] =>
  Object.values(PACKS).flatMap((pack) => (Object.values(pack) as PackItem[][]).flat());

const spiceOf = new Map<string, Spice>(allPackItems().map((i) => [i.id, i.spice]));

const ids = (content: object) =>
  Object.values(content).flatMap((items: { id: string }[]) => items.map((i) => i.id));

describe("hand-written packs", () => {
  test("ids are unique across all packs", () => {
    const all = allPackItems().map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
  });

  // Games without content (Brick Brawl, In Order, Doodle Champions, Paint Grab, Hue Clue, Doodle Smash) have no pack file.
  test.each(GAME_IDS.filter((id) => Object.keys(PACKS[id]).length))("the %s pack stays within the size cap", (gameId) => {
    expect(statSync(new URL(`../packs/${gameId}.json`, import.meta.url)).size).toBeLessThanOrEqual(PACK_MAX_BYTES);
  });

  test("every item has a known topic and style", () => {
    const untagged = allPackItems().filter((i) => !Object.hasOwn(TOPICS, i.topic) || !Object.hasOwn(STYLES, i.style));
    expect(untagged.map((i) => `${i.id}: ${i.topic}/${i.style}`)).toEqual([]);
  });

  test.each(GAME_IDS)("every %s item passes the game's content schema", (gameId) => {
    const stripped = Object.fromEntries(
      Object.entries(PACKS[gameId]).map(([key, items]: [string, PackItem[]]) => [
        key,
        items.map(({ spice: _spice, topic: _topic, style: _style, ...rest }) => rest),
      ]),
    );
    const result = GAMES[gameId].contentSchema.safeParse(stripped);
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true);
  });
});

describe("packContent", () => {
  test.each(GAME_IDS.flatMap((g) => [1, 3, 5, 12].flatMap((n) => (["mild", "spicy"] as const).map((s) => [g, n, s] as const))))(
    "%s x%i (%s) passes the content schema",
    (gameId, count, spice) => {
      const content = packContent(request(gameId, count, spice), 42);
      expect(GAMES[gameId].contentSchema.safeParse(content).success).toBe(true);
      expect(JSON.stringify(content)).not.toMatch(/"(spice|topic|style)":/);
    },
  );

  test("mild requests only use mild items; spicy requests mix both", () => {
    const mild = ids(packContent(request("bot-or-not", 20, "mild"), 1));
    expect(mild.every((id) => spiceOf.get(id) === "mild")).toBe(true);
    const spicy = ids(packContent(request("bot-or-not", 10, "spicy"), 1)).map((id) => spiceOf.get(id));
    expect(spicy.filter((s) => s === "spicy").length).toBeGreaterThanOrEqual(4);
    expect(spicy.filter((s) => s === "mild").length).toBeGreaterThanOrEqual(4);
  });

  test("skips avoided ids while enough remain", () => {
    const first = packContent(request("skip-logic", 10, "mild"), 7);
    const avoid = ids(first);
    const second = packContent(request("skip-logic", 10, "mild", avoid), 7);
    expect(ids(second).some((id) => avoid.includes(id))).toBe(false);
  });

  test("returns the requested number of answer cards", () => {
    const content = packContent({ ...request("worst-feedback", 3, "mild"), extraCount: 66 }, 3);
    expect(content.prompts).toHaveLength(3);
    expect(content.answers).toHaveLength(66);
  });

  test("survey questions cover every kind", () => {
    const { questions } = packContent(request("survey-says", 5, "mild"), 9);
    expect(new Set(questions.map((q) => q.kind))).toEqual(new Set(["who", "scale", "choice"]));
  });

  test("is deterministic for a seed", () => {
    expect(packContent(request("survey-says", 5, "spicy"), 11)).toEqual(packContent(request("survey-says", 5, "spicy"), 11));
  });
});

describe("buildContent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const budget = (allows: () => Promise<boolean>) => ({ allows: vi.fn(allows), spend: vi.fn(async () => {}) });

  test("uses the packs when there's no API key", async () => {
    const result = await buildContent({ enabled: true }, request("bot-or-not", 3, "mild"), 5);
    expect(result.source).toBe("pack");
    expect(result.content.pairs).toHaveLength(3);
  });

  test("uses the packs unless AI is enabled, even with a key", async () => {
    const result = await buildContent({ apiKey: "sk-test" }, request("skip-logic", 6, "spicy"), 5);
    expect(result.source).toBe("pack");
  });

  test("uses the packs once today's budget is spent", async () => {
    const spent = budget(async () => false);
    const result = await buildContent({ enabled: true, apiKey: "sk-test", budget: spent }, request("skip-logic", 6, "mild"), 5);
    expect(result.source).toBe("pack");
    expect(spent.allows).toHaveBeenCalled();
    expect(spent.spend).not.toHaveBeenCalled();
  });

  test("skips Claude when today's spend can't be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = budget(async () => {
      throw new Error("D1 is down");
    });
    expect(await aiAvailable({ enabled: true, apiKey: "sk-test", budget: broken })).toBe(false);
  });

  test("falls back to the packs when the model call fails", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:9/v1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await buildContent({ enabled: true, apiKey: "sk-invalid" }, request("survey-says", 5, "mild"), 5);
    expect(result.source).toBe("pack");
    expect(GAMES["survey-says"].contentSchema.safeParse(result.content).success).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe("estimateCost", () => {
  test("prices input and output per million tokens", () => {
    expect(estimateCost("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(24);
    expect(estimateCost("claude-haiku-5-5", { inputTokens: 2000, outputTokens: 400 })).toBeCloseTo(0.0004);
  });

  test("prices unknown models like the most expensive one", () => {
    expect(estimateCost("claude-next", { inputTokens: 1_000_000 })).toBe(estimateCost("claude-fable-5-1", { inputTokens: 1_000_000 }));
  });
});
