import type { MatchView, WorstFeedbackView } from "@brick/game";
import { describe, expect, test } from "vitest";
import { partsOf, type Actor } from "./act";

const members = ["human", "bea"].map((id) => ({
  id,
  name: id === "human" ? "Javi" : "Bea",
  avatar: { color: "teal" as const, hat: "none" as const, face: "classic" as const, shape: "brick" as const },
  status: "online" as const,
  score: 0,
  playing: true,
}));

const game = {
  phase: "answer",
  endsAt: 60_000,
  round: 0,
  totalRounds: 3,
  prompt: "Our NPS dropped because ____.",
  hand: [{ id: "a1", text: "Soup.", fresh: false }],
  swapsLeft: 2,
  answeredIds: [],
  myAnswer: null,
  ballot: null,
  votedIds: [],
  myVote: null,
  results: null,
  points: {},
} as unknown as WorstFeedbackView;

const view = {
  code: "BRKZ",
  phase: "playing",
  members,
  game: { gameId: "worst-feedback", players: ["human", "bea"], view: game, deadline: null },
} as unknown as MatchView;

const bea: Actor = { name: "Bea", id: "bea", view };

describe("partsOf", () => {
  test("sends a chat line and a reaction from one item", () => {
    const parts = partsOf(bea, { bot: "Bea", say: "this one is mine", react: "lol", target: "Javi" });
    expect(parts.map((p) => p.message)).toEqual([
      { type: "chat", text: "this one is mine" },
      { type: "react", emoji: "lol", target: "human" },
    ]);
    expect(parts.every((p) => !p.move)).toBe(true);
  });

  test("sends a game move with a chat line", () => {
    const parts = partsOf(bea, { bot: "Bea", action: { type: "play", cardId: "a1" }, say: "trust me" });
    expect(parts.map((p) => p.message.type)).toEqual(["action", "chat"]);
    expect(parts[0]!.move).toBe(true);
  });

  test("rejects two game moves in one item", () => {
    expect(() => partsOf(bea, { bot: "Bea", action: { type: "play", cardId: "a1" }, ready: true })).toThrow(/at most one of action, draw or ready/);
  });

  test("checks every part before sending any", () => {
    expect(() => partsOf(bea, { bot: "Bea", say: "hi", react: "heart" })).toThrow(/Reactions are/);
    expect(() => partsOf(bea, { bot: "Bea" })).toThrow(/Give one of/);
  });
});

describe("drawing in Fake Artist", () => {
  const fakeView = { ...view, game: { gameId: "fake-artist", players: ["human", "bea"], view: {}, deadline: null } } as unknown as MatchView;
  const artist: Actor = { name: "Bea", id: "bea", view: fakeView };

  test("sends one shape as a single line", () => {
    const [part] = partsOf(artist, { bot: "Bea", draw: "curve 200 500 500 200 800 500" });
    expect(part?.message).toMatchObject({ type: "action", action: { type: "line" } });
  });

  test("refuses more than one shape, or a fill", () => {
    expect(() => partsOf(artist, { bot: "Bea", draw: "line 0 0 10 10; line 20 20 30 30" })).toThrow(/exactly one line/);
    expect(() => partsOf(artist, { bot: "Bea", draw: "fill circle 500 500 100" })).toThrow(/exactly one line/);
  });
});

describe("drawing in Doodle Champions", () => {
  const doodleView = { ...view, game: { gameId: "doodle-champions", players: ["human", "bea"], view: {}, deadline: null } } as unknown as MatchView;
  const artist: Actor = { name: "Bea", id: "bea", view: doodleView };

  test("sends the whole fighter with each shape tagged with its part", () => {
    const [part] = partsOf(artist, { bot: "Bea", draw: "part body; fill circle 500 500 150; part legs; line 450 640 420 900; line 550 640 580 900; part weapon; line 650 500 800 300" });
    expect(part?.message).toMatchObject({ type: "action", action: { type: "fighter" } });
    const strokes = (part!.message as { action: { strokes: { t?: string }[] } }).action.strokes;
    expect(strokes.map((s) => s.t)).toEqual(["body", "legs", "legs", "weapon"]);
  });

  test("untagged shapes are body, but a fighter of only limbs is refused", () => {
    expect(() => partsOf(artist, { bot: "Bea", draw: "circle 500 500 100" })).not.toThrow();
    expect(() => partsOf(artist, { bot: "Bea", draw: "part legs; line 500 600 500 900" })).toThrow(/needs a body/);
    expect(() => partsOf(artist, { bot: "Bea", draw: "part tail; line 500 600 500 900" })).toThrow(/Unknown part/);
  });
});

describe("answering in Survey Says", () => {
  const surveyView = (question: object) =>
    ({ ...view, game: { gameId: "survey-says", players: ["human", "bea"], view: { phase: "answer", question }, deadline: null } }) as unknown as MatchView;
  const scale = surveyView({ kind: "scale", text: "How spicy?", options: [], minLabel: "mild", maxLabel: "lava" });
  const who = surveyView({ kind: "who", text: "Who replies fastest?", options: [{ key: "human", label: "Javi" }, { key: "bea", label: "Bea" }], minLabel: null, maxLabel: null });
  const choice = surveyView({ kind: "choice", text: "Best snack?", options: [{ key: "0", label: "Soup" }, { key: "1", label: "Toast" }], minLabel: null, maxLabel: null });
  const send = (v: MatchView, answer: unknown, prediction: unknown) => partsOf({ name: "Bea", id: "bea", view: v }, { bot: "Bea", action: { type: "submit", answer, prediction } });

  test("a scale question takes numbers, not strings", () => {
    expect(() => send(scale, "8", 6)).toThrow(/scale question: "answer" takes a number from 0 to 10.*not "8"/);
    expect(() => send(scale, 8, "6")).toThrow(/"prediction" takes a number/);
    expect(send(scale, 8, 6)[0]!.message).toEqual({ type: "action", action: { type: "submit", answer: 8, prediction: 6 } });
  });

  test("who and choice questions take a name or an option key, not a number", () => {
    expect(() => send(who, 1, "Bea")).toThrow(/who question: "answer" takes a player's name: Javi, Bea, not 1/);
    expect(() => send(choice, "1", 0)).toThrow(/choice question: "prediction" takes an option's key as a string: "0" \(Soup\), "1" \(Toast\), not 0/);
    expect(() => send(choice, "2", "1")).toThrow(/not "2"/);
    expect(send(who, "javi", "Bea")[0]!.message).toEqual({ type: "action", action: { type: "submit", answer: "human", prediction: "bea" } });
    expect(send(choice, "1", "0")[0]!.message).toMatchObject({ action: { answer: "1", prediction: "0" } });
  });
});

test("points a drawing sent as an action to the draw field", () => {
  expect(() => partsOf(bea, { bot: "Bea", action: { type: "draw", strokes: [] } })).toThrow(/own "draw" field/);
});
