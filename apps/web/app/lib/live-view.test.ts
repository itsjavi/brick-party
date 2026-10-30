import type { MatchView } from "@brick/game";
import { describe, expect, test } from "vitest";
import { LIVE_VIEW_INTERVAL_MS, chromeKey, viewDelay } from "./live-view";

const view = (
  over: Partial<MatchView> = {},
  game: unknown = { phase: "fight", fight: { tick: 1 } },
): MatchView => ({
  code: "SMSH",
  phase: "playing",
  phaseEndsAt: null,
  serverNow: 1000,
  you: "p0",
  hostId: "p0",
  members: [],
  settings: { preset: "quick", custom: [], spice: "mild" },
  playlist: ["doodle-smash"],
  index: 0,
  game: { gameId: "doodle-smash", players: ["p0"], view: game, deadline: 5000 },
  introReady: [],
  lastGame: null,
  report: null,
  matchId: null,
  ai: false,
  test: null,
  bots: [],
  paused: false,
  clockEpoch: 0,
  extendMs: null,
  live: true,
  ...over,
});

const shownAt = (v: MatchView, at: number) => ({ key: chromeKey(v), at });

describe("viewDelay", () => {
  test("views of games that aren't live go to React at once, every time", () => {
    const a = view({ live: false });
    const b = view({ live: false, serverNow: 1050 }, { phase: "fight", fight: { tick: 2 } });
    expect(viewDelay(shownAt(a, 0), b, chromeKey(b), 10)).toBe(0);
  });

  test("the first view goes at once", () => {
    const a = view();
    expect(viewDelay(null, a, chromeKey(a), 0)).toBe(0);
  });

  test("a live update that only moves the fight waits its turn", () => {
    const a = view();
    const b = view({ serverNow: 1066 }, { phase: "fight", fight: { tick: 2 } });
    expect(chromeKey(b)).toBe(chromeKey(a));
    expect(viewDelay(shownAt(a, 100), b, chromeKey(b), 166)).toBe(LIVE_VIEW_INTERVAL_MS - 66);
    expect(viewDelay(shownAt(a, 100), b, chromeKey(b), 100 + LIVE_VIEW_INTERVAL_MS)).toBe(0);
  });

  test("a live update goes at once when the game's phase, the room or the pause changes", () => {
    const a = view();
    const changes = [
      view({}, { phase: "results", fight: { tick: 2 } }),
      view({ paused: true }),
      view({
        members: [
          {
            id: "p1",
            name: "Bea",
            avatar: { color: "teal", hat: "none", face: "classic", shape: "brick" },
            status: "online",
            score: 0,
            playing: true,
          },
        ],
      }),
      view({ hostId: "p1" }),
      view({ live: false }),
    ];
    for (const b of changes) expect(viewDelay(shownAt(a, 100), b, chromeKey(b), 110)).toBe(0);
  });

  test("the game starting to run live goes at once", () => {
    const a = view({ live: false }, { phase: "weighin" });
    const b = view();
    expect(viewDelay(shownAt(a, 100), b, chromeKey(b), 110)).toBe(0);
  });
});
