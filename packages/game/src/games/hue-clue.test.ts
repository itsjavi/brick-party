import { describe, expect, test } from "vitest";
import { todoFor } from "../bots";
import type { MatchView } from "../match";
import { createRng } from "../rng";
import { players as makePlayers } from "../test-helpers";
import { HUE_CLUE_POINTS, clueProblem, hueClue, hueClueActionSchema, type HueClueState } from "./hue-clue";
import {
  HUE_CELLS,
  HUE_COLORS,
  HUE_COLS,
  HUE_ROWS,
  cellAt,
  cellLabel,
  cellX,
  cellY,
  describeCell,
  parseCell,
  ringDistance,
} from "./hue-grid";
import { HUE_WORDS, HUE_WORD_CELLS, botClue, botGuess, knownWord, wordCoverage } from "./hue-words";

const T0 = 1_000;

function start(n = 5, seed = 3) {
  const players = makePlayers(n);
  let s = hueClue.init({ players, content: {}, spice: "mild", seed, now: T0, pace: 1 }).state;
  let now = T0;
  return {
    players,
    get s(): HueClueState {
      return s;
    },
    get round() {
      return s.rounds[s.roundIndex]!;
    },
    tick() {
      now = Math.max(now, hueClue.deadline(s)!);
      s = hueClue.reduce(s, { type: "tick", now }).state;
    },
    act(playerId: string, action: unknown) {
      const parsed = hueClueActionSchema.safeParse(action);
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      s = hueClue.reduce(s, { type: "action", playerId, action: parsed.data, now }).state;
    },
    leave(playerId: string) {
      s = hueClue.reduce(s, { type: "player_left", playerId, now }).state;
    },
    guessers() {
      return players.map((p) => p.id).filter((id) => id !== s.rounds[s.roundIndex]!.giverId);
    },
  };
}

/** The cell `rings` away from `target`, straight across or down, inside the board. */
function away(target: number, rings: number): number {
  const x = cellX(target);
  const y = cellY(target);
  if (x + rings < HUE_COLS) return cellAt(x + rings, y);
  if (x - rings >= 0) return cellAt(x - rings, y);
  return cellAt(x, y + rings < HUE_ROWS ? y + rings : y - rings);
}

describe("the board", () => {
  test("has 16 by 10 different colours, as hex", () => {
    expect(HUE_COLORS).toHaveLength(HUE_CELLS);
    expect(HUE_CELLS).toBe(160);
    expect(HUE_COLORS.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(new Set(HUE_COLORS).size).toBe(HUE_CELLS);
  });

  test("labels cells by column letter and row number, both ways", () => {
    expect(cellLabel(0)).toBe("A1");
    expect(cellLabel(HUE_CELLS - 1)).toBe("P10");
    for (let cell = 0; cell < HUE_CELLS; cell++) expect(parseCell(cellLabel(cell))).toBe(cell);
    expect(parseCell("f4")).toBe(3 * HUE_COLS + 5);
    expect(parseCell("Q1")).toBeNull();
    expect(parseCell("A11")).toBeNull();
    expect(parseCell("A0")).toBeNull();
    expect(describeCell(0)).toBe("very pale red");
  });

  test("counts rings like squares around a cell", () => {
    expect(ringDistance(cellAt(5, 5), cellAt(5, 5))).toBe(0);
    expect(ringDistance(cellAt(5, 5), cellAt(6, 6))).toBe(1);
    expect(ringDistance(cellAt(5, 5), cellAt(3, 6))).toBe(2);
    expect(ringDistance(cellAt(0, 0), cellAt(15, 9))).toBe(15);
  });
});

describe("clues", () => {
  test.each(["banana", "ripe Banana", "lava", "deep sea", "crème brûlée", "flamingo's", "sea-salt"])(
    "%s is fine",
    (clue) => {
      expect(clueProblem(clue)).toBeNull();
    },
  );

  test.each([
    ["", "Type a clue."],
    ["   ", "Type a clue."],
    ["very ripe banana", "One or two words."],
    ["red", "No colour names."],
    ["Bluish", "No colour names."],
    ["dark GREEN", "No colour names."],
    ["orangey", "No colour names."],
    ["grey-ish", "No colour names."],
    ["banana 2", "No numbers."],
    ["F4", "No numbers."],
    ["three", "No numbers."],
    ["a".repeat(25), "Keep it short: 24 characters at most."],
  ])("%j is refused: %s", (clue, problem) => {
    expect(clueProblem(clue)).toBe(problem);
    expect(hueClueActionSchema.safeParse({ type: "clue", text: clue }).success).toBe(false);
  });

  test("a guess takes a cell index or a label", () => {
    expect(hueClueActionSchema.parse({ type: "guess", cell: "b2" })).toEqual({ type: "guess", cell: 17 });
    expect(hueClueActionSchema.parse({ type: "guess", cell: 17, lock: true })).toEqual({
      type: "guess",
      cell: 17,
      lock: true,
    });
    expect(hueClueActionSchema.safeParse({ type: "guess", cell: "Z9" }).success).toBe(false);
    expect(hueClueActionSchema.safeParse({ type: "guess", cell: HUE_CELLS }).success).toBe(false);
  });
});

describe("Hue Clue", () => {
  test("everyone gives a clue once, or twice in rooms of four or fewer", () => {
    for (const n of [3, 4, 5, 8, 12]) {
      const g = start(n);
      const givers = g.s.rounds.map((r) => r.giverId);
      const laps = n <= 4 ? 2 : 1;
      expect(givers).toHaveLength(n * laps);
      for (const p of g.players) expect(givers.filter((id) => id === p.id)).toHaveLength(laps);
      // Targets are spread out over the board.
      expect(new Set(g.s.rounds.map((r) => r.target)).size).toBe(givers.length);
    }
  });

  test("only the clue-giver sees the target before the reveal", () => {
    const g = start();
    const giver = g.round.giverId;
    const target = g.round.target;
    const leaks = (viewer: string | null) => {
      const view = hueClue.view(g.s, viewer);
      const { target: shown, ...rest } = view;
      // Nothing else in the view carries the cell, as a number or as a label.
      const text = JSON.stringify({ ...rest, endsAt: 0, points: {} });
      return {
        shown,
        label: text.includes(cellLabel(target)),
        number: (text.match(/\d+/g) ?? ([] as string[])).includes(String(target)),
      };
    };
    expect(leaks(giver).shown).toBe(target);
    expect(hueClue.view(g.s, giver).youGive).toBe(true);
    for (const id of [...g.guessers(), null]) {
      const leak = leaks(id);
      expect(leak.shown).toBeNull();
      expect(leak.label).toBe(false);
      expect(leak.number).toBe(false);
    }
    g.act(giver, { type: "clue", text: "banana" });
    expect(g.s.phase).toBe("guess");
    for (const id of g.guessers()) expect(hueClue.view(g.s, id).target).toBeNull();
    // Pins are secret too: others only see who has one down.
    const [a, b] = g.guessers();
    g.act(a!, { type: "guess", cell: 42 });
    const view = hueClue.view(g.s, b!);
    expect(view.placedIds).toEqual([a]);
    expect(view.myPin).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"cell"');
    expect(hueClue.view(g.s, a!).myPin).toEqual({ cell: 42, locked: false });
    g.tick();
    expect(g.s.phase).toBe("reveal");
    expect(hueClue.view(g.s, b!).target).toBe(target);
    expect(hueClue.view(g.s, b!).reveal?.pins.map((p) => p.playerId)).toEqual([a]);
  });

  test("scores by distance, and the clue-giver scores for every pin close by", () => {
    const g = start(6);
    const giver = g.round.giverId;
    const target = g.round.target;
    g.act(giver, { type: "clue", text: "lava" });
    const [p0, p1, p2, p3, p4] = g.guessers();
    g.act(p0!, { type: "guess", cell: target, lock: true });
    g.act(p1!, { type: "guess", cell: away(target, 1), lock: true });
    g.act(p2!, { type: "guess", cell: away(target, 2), lock: true });
    g.act(p3!, { type: "guess", cell: away(target, 3), lock: true });
    expect(g.s.phase).toBe("guess");
    g.act(p4!, { type: "guess", cell: away(target, 6), lock: true });
    // Everyone locked in: no waiting for the clock.
    expect(g.s.phase).toBe("reveal");
    expect(g.s.points).toMatchObject({
      [p0!]: HUE_CLUE_POINTS.guess[0],
      [p1!]: HUE_CLUE_POINTS.guess[1],
      [p2!]: HUE_CLUE_POINTS.guess[2],
      [p3!]: 0,
      [p4!]: 0,
      [giver]: 2 * HUE_CLUE_POINTS.giver[0] + HUE_CLUE_POINTS.giver[2],
    });
    expect(g.s.stats[p0!]).toMatchObject({ bullseyes: 1 });
    expect(g.s.stats[p4!]).toMatchObject({ wayOff: 1 });
    expect(g.s.stats[giver]).toMatchObject({ clueHits: 2 });
    const reveal = hueClue.view(g.s, p3!).reveal!;
    expect(reveal.pins.map((p) => p.rings)).toEqual([0, 1, 2, 3, 6]);
    expect(reveal.giverPoints).toBe(250);
  });

  test("pins move until they're locked, and count when time runs out", () => {
    const g = start(4);
    const giver = g.round.giverId;
    const target = g.round.target;
    g.act(giver, { type: "clue", text: "ocean" });
    const [a, b] = g.guessers();
    g.act(a!, { type: "guess", cell: away(target, 4) });
    g.act(a!, { type: "guess", cell: target });
    g.act(b!, { type: "guess", cell: target, lock: true });
    g.act(b!, { type: "guess", cell: away(target, 5) });
    expect(g.round.pins[b!]).toEqual({ cell: target, locked: true });
    // The giver can't guess, and nobody can guess before the clue.
    g.act(giver, { type: "guess", cell: target });
    expect(g.round.pins[giver]).toBeUndefined();
    g.tick();
    expect(g.s.phase).toBe("reveal");
    expect(g.s.points[a!]).toBe(HUE_CLUE_POINTS.guess[0]);
    expect(g.s.points[b!]).toBe(HUE_CLUE_POINTS.guess[0]);
  });

  test("only the clue-giver gives a clue, and only an allowed one", () => {
    const g = start();
    const giver = g.round.giverId;
    const other = g.guessers()[0]!;
    g.act(other, { type: "clue", text: "banana" });
    expect(g.s.phase).toBe("clue");
    // Refused by the schema, and by the game for anything that slips past it.
    expect(() => g.act(giver, { type: "clue", text: "yellow" })).toThrow("No colour names.");
    g.act(giver, { type: "clue", text: "  ripe   banana " });
    expect(g.round.clue).toBe("ripe banana");
    expect(g.round.autoClue).toBe(false);
  });

  test("a clue-giver who runs out of time gets a house clue, and no points for it", () => {
    const g = start();
    const giver = g.round.giverId;
    const target = g.round.target;
    g.tick();
    expect(g.s.phase).toBe("guess");
    expect(g.round.autoClue).toBe(true);
    expect(clueProblem(g.round.clue!)).toBeNull();
    for (const id of g.guessers()) g.act(id, { type: "guess", cell: target, lock: true });
    expect(g.s.points[giver]).toBe(0);
    expect(g.s.stats[giver]?.clueHits).toBeUndefined();
  });

  test("a clue-giver who leaves takes their round with them; leaving guessers aren't waited for", () => {
    const g = start(5);
    const first = g.round.giverId;
    g.leave(first);
    expect(g.s.rounds[0]!.skipped).toBe(true);
    expect(g.s.roundIndex).toBe(1);
    expect(g.s.phase).toBe("clue");
    const giver = g.round.giverId;
    g.act(giver, { type: "clue", text: "plum" });
    const [a, b, c] = g.guessers().filter((id) => id !== first);
    g.act(a!, { type: "guess", cell: 0, lock: true });
    g.act(b!, { type: "guess", cell: 1, lock: true });
    expect(g.s.phase).toBe("guess");
    g.leave(c!);
    expect(g.s.phase).toBe("reveal");
  });

  test("plays to the end, and the last round's reveal stays up", () => {
    const g = start(3);
    for (let i = 0; i < 100 && g.s.phase !== "done"; i++) {
      if (g.s.phase === "clue") g.act(g.round.giverId, { type: "clue", text: botClue(g.round.target) });
      else if (g.s.phase === "guess")
        for (const id of g.guessers())
          g.act(id, { type: "guess", cell: botGuess(g.round.clue!), lock: true });
      else g.tick();
    }
    expect(hueClue.isOver(g.s)).toBe(true);
    expect(g.s.roundIndex).toBe(5);
    const view = hueClue.view(g.s, "p0");
    expect(view.reveal).not.toBeNull();
    expect(view.past).toHaveLength(6);
    expect(hueClue.deadline(g.s)).toBeNull();
    expect(Object.values(hueClue.scores(g.s)).some((p) => p > 0)).toBe(true);
  });
});

describe("Hue Clue bots", () => {
  test("every cell has a known thing close by, and words are things, not colour names", () => {
    expect(wordCoverage()).toBe(1);
    for (const word of Object.keys(HUE_WORDS)) {
      expect(clueProblem(word)).toBeNull();
      expect(knownWord(word)).toBe(word);
    }
    expect(knownWord("Cherries")).toBe("cherry");
    expect(knownWord("ripe bananas")).toBe("banana");
    expect(knownWord("spaceship")).toBeNull();
  });

  test("a bot guesser lands near a bot clue-giver's colour most of the time", () => {
    const rng = createRng(11);
    let close = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const target = rng.int(HUE_CELLS);
      const clue = botClue(target, rng.next);
      expect(clueProblem(clue)).toBeNull();
      if (ringDistance(botGuess(clue, rng.next), target) <= 1) close++;
    }
    expect(close / trials).toBeGreaterThan(0.7);
  });

  test("dark and pale move a guess down or up the board, and unknown clues get a random cell", () => {
    const always = () => 0.1;
    const at = HUE_WORD_CELLS.cherry!;
    expect(botGuess("cherry", always)).toBe(at);
    expect(cellY(botGuess("pale cherry", always))).toBe(Math.max(0, cellY(at) - 2));
    const cells = new Set(Array.from({ length: 40 }, (_, i) => botGuess("spaceship", () => (i * 0.618) % 1)));
    expect(cells.size).toBeGreaterThan(20);
  });

  test("bots give clues and guess through their todos", () => {
    const g = start(4);
    const view = (id: string) =>
      ({
        phase: "playing",
        game: { gameId: "hue-clue", players: g.players.map((p) => p.id), view: hueClue.view(g.s, id) },
      }) as unknown as MatchView;
    const giver = g.round.giverId;
    const guesser = g.guessers()[0]!;
    expect(todoFor(view(guesser), guesser)).toBeNull();
    const clueTodo = todoFor(view(giver), giver)!;
    expect(clueTodo.hint).toContain(cellLabel(g.round.target));
    expect(clueTodo.hint).toContain(HUE_COLORS[g.round.target]);
    g.act(giver, clueTodo.fallback(createRng(1).next));
    expect(g.s.phase).toBe("guess");
    expect(todoFor(view(giver), giver)).toBeNull();
    const guessTodo = todoFor(view(guesser), guesser)!;
    expect(guessTodo.hint).toContain(JSON.stringify(g.round.clue));
    g.act(guesser, guessTodo.fallback(createRng(2).next));
    expect(g.round.pins[guesser]?.locked).toBe(true);
    expect(todoFor(view(guesser), guesser)).toBeNull();
  });
});

test("punctuation in a clue is dropped, not refused", () => {
  expect(clueProblem("honeydew melon!")).toBeNull();
  expect(clueProblem("lava?!")).toBeNull();
  expect(clueProblem("lava 2")).toBe("No numbers.");
});
