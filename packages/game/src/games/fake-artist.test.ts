import { describe, expect, test } from "vitest";
import { players as makePlayers } from "../test-helpers";
import { FAKE_ARTIST_POINTS, fakeArtist, guessesWord, type FakeArtistState } from "./fake-artist";

const T0 = 1_000;
const players = makePlayers(4);
const content = {
  words: [
    { id: "w1", category: "Animals", word: "Giraffe" },
    { id: "w2", category: "Food", word: "Pizza" },
  ],
};
const line = [100, 100, 200, 200, 300, 250];

function start(seed = 3) {
  let s = fakeArtist.init({ players, content, spice: "mild", seed, now: T0, pace: 1 }).state;
  const act = (playerId: string, action: unknown, now = T0) => {
    s = fakeArtist.reduce(s, { type: "action", playerId, action, now }).state;
  };
  return {
    get s(): FakeArtistState {
      return s;
    },
    act,
    tick(now: number) {
      s = fakeArtist.reduce(s, { type: "tick", now }).state;
    },
    leave(playerId: string) {
      s = fakeArtist.reduce(s, { type: "player_left", playerId, now: T0 }).state;
    },
    /** Every turn of the round draws a line. */
    drawAll() {
      while (s.phase === "draw")
        act(s.rounds[s.roundIndex]!.turns[s.turnIndex]!, { type: "line", points: line });
    },
  };
}

const round = (s: FakeArtistState) => s.rounds[s.roundIndex]!;

describe("Fake Artist", () => {
  test("only the fake misses the word, and the fake never draws first", () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = start(seed);
      const r = round(g.s);
      expect(r.turns[0]).not.toBe(r.fakeId);
      expect(r.turns).toHaveLength(players.length * 2);
      for (const p of players) {
        const view = fakeArtist.view(g.s, p.id);
        expect(view.word).toBe(p.id === r.fakeId ? null : r.word.word);
        expect(view.category).toBe(r.word.category);
        expect(view.fakeId).toBeNull();
      }
      expect(fakeArtist.view(g.s, null).word).toBeNull();
    }
  });

  test("players draw one line per turn, in order, and only on their turn", () => {
    const g = start();
    const r = round(g.s);
    const notMe = players.find((p) => p.id !== r.turns[0])!.id;
    g.act(notMe, { type: "line", points: line });
    expect(round(g.s).lines).toHaveLength(0);
    g.act(r.turns[0]!, { type: "line", points: line });
    expect(round(g.s).lines).toEqual([{ playerId: r.turns[0], p: line }]);
    expect(fakeArtist.view(g.s, notMe).drawerId).toBe(r.turns[1]);
    g.drawAll();
    expect(g.s.phase).toBe("vote");
    expect(round(g.s).lines).toHaveLength(players.length * 2);
  });

  test("a turn that runs out is skipped, and so is a player who left", () => {
    const g = start();
    const r = round(g.s);
    g.tick(fakeArtist.deadline(g.s)!);
    expect(g.s.turnIndex).toBe(1);
    expect(round(g.s).lines).toHaveLength(0);
    g.leave(r.turns[2]!);
    g.act(r.turns[1]!, { type: "line", points: line });
    expect(r.turns[g.s.turnIndex]).not.toBe(r.turns[2]);
  });

  test("a caught fake who guesses the word still scores", () => {
    const g = start();
    g.drawAll();
    const fake = round(g.s).fakeId;
    for (const p of players)
      g.act(p.id, { type: "vote", targetId: p.id === fake ? players.find((x) => x.id !== fake)!.id : fake });
    expect(g.s.phase).toBe("guess");
    expect(fakeArtist.view(g.s, players[0]!.id).fakeId).toBe(fake);
    g.act(fake, { type: "guess", text: `the ${round(g.s).word.word.toLowerCase()}s` });
    expect(g.s.phase).toBe("results");
    expect(round(g.s).guessCorrect).toBe(true);
    expect(g.s.points[fake]).toBe(FAKE_ARTIST_POINTS.fakeGuess);
    for (const p of players) if (p.id !== fake) expect(g.s.points[p.id]).toBe(FAKE_ARTIST_POINTS.correctVote);
    expect(fakeArtist.stats(g.s)[fake]).toMatchObject({ fakeGuesses: 1 });
  });

  test("a tie lets the fake escape, and the most-voted artist is framed", () => {
    const g = start();
    g.drawAll();
    const fake = round(g.s).fakeId;
    const [a, b, c] = players.filter((p) => p.id !== fake).map((p) => p.id) as [string, string, string];
    g.act(a, { type: "vote", targetId: fake });
    g.act(b, { type: "vote", targetId: c });
    g.act(c, { type: "vote", targetId: fake });
    g.act(fake, { type: "vote", targetId: c });
    expect(g.s.phase).toBe("results");
    expect(round(g.s).caught).toBe(false);
    expect(g.s.points[fake]).toBe(FAKE_ARTIST_POINTS.fakeEscapes);
    const view = fakeArtist.view(g.s, a);
    expect(view.word).toBe(round(g.s).word.word);
    expect(view.reveal?.caught).toBe(false);
  });

  test("plays every round to the end", () => {
    const g = start();
    for (let r = 0; r < 2; r++) {
      g.drawAll();
      g.tick(fakeArtist.deadline(g.s)!);
      if (g.s.phase === "guess") g.tick(fakeArtist.deadline(g.s)!);
      expect(g.s.phase).toBe("results");
      g.tick(fakeArtist.deadline(g.s)!);
    }
    expect(fakeArtist.isOver(g.s)).toBe(true);
    expect(new Set(g.s.rounds.map((r) => r.fakeId)).size).toBe(2);
  });

  test("guesses forgive case, plurals, articles and one typo in long words", () => {
    expect(guessesWord("Giraffe", "the giraffes")).toBe(true);
    expect(guessesWord("Giraffe", "girafe")).toBe(true);
    expect(guessesWord("Ice cream", "icecream")).toBe(true);
    expect(guessesWord("Bus", "bug")).toBe(false);
    expect(guessesWord("Giraffe", "zebra")).toBe(false);
  });
});
