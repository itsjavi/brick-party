import { describe, expect, test } from "vitest";
import { computeAwards } from "./awards";

describe("awards", () => {
  test("no winner or last-place award when nobody pulled ahead", () => {
    const ids = computeAwards([], ["a", "b", "c"], { a: 0, b: 0, c: 0 }).map((a) => a.id);
    expect(ids).toEqual([]);
  });

  test("top and bottom awards go to the leader and the last player", () => {
    const awards = computeAwards(
      [{ gameId: "worst-feedback", players: ["a", "b", "c"], points: { a: 300, b: 100, c: 0 }, stats: { a: { promoterVotes: 3 } } }],
      ["a", "b", "c"],
      { a: 300, b: 100, c: 0 },
    );
    expect(awards.map((a) => [a.id, a.playerId])).toEqual([
      ["nps-100", "a"],
      ["voice-of-customer", "a"],
      ["churn-risk", "c"],
    ]);
  });
});
