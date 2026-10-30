import { GO_TICK, SMASH_TICK_MS, cellLabel, doodleChampions, doodleChampionsActionSchema, doodleSmash, doodleSmashActionSchema, fightSight, hueClue, makeItWorse, paintGrab, smashBot, type MakeItWorseState, type DoodleSmashState, type HueClueState, type BotOrNotView, type DoodleChampionsState, type InOrderView, type MatchView, type SkipLogicView, type WorstFeedbackView } from "@brick/game";
import { describe, expect, test } from "vitest";
import { drawAction, gameMessage, partsOf } from "./act";
import { botLines, roomLines, situationKey, situationLine, todoFor } from "./moves";

const NOW = 1_000_000;
const members = ["human", "bea", "cal"].map((id) => ({
  id,
  name: id === "human" ? "Javi" : id[0]!.toUpperCase() + id.slice(1),
  avatar: { color: "teal" as const, hat: "none" as const, face: "classic" as const, shape: "brick" as const },
  status: "online" as const,
  score: 0,
  playing: true,
}));

function room(gameId: "worst-feedback" | "bot-or-not" | "skip-logic" | "in-order" | "doodle-champions" | "paint-grab" | "hue-clue" | "doodle-smash" | "make-it-worse", game: unknown): MatchView {
  return {
    code: "BRKZ",
    phase: "playing",
    phaseEndsAt: null,
    serverNow: NOW,
    you: "bea",
    hostId: "human",
    members,
    settings: { preset: "quick", custom: [], spice: "mild" },
    playlist: [gameId],
    index: 0,
    game: { gameId, players: members.map((m) => m.id), view: game, deadline: null },
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
    live: false,
  };
}

const worstFeedback = (over: Partial<WorstFeedbackView> = {}): WorstFeedbackView => ({
  phase: "answer",
  endsAt: NOW + 60_000,
  round: 0,
  totalRounds: 3,
  prompt: "Our NPS dropped because ____.",
  hand: [
    { id: "a1", text: "Soup.", fresh: false },
    { id: "a2", text: "Vibes.", fresh: true },
  ],
  swapsLeft: 2,
  answeredIds: [],
  myAnswer: null,
  ballot: null,
  votedIds: [],
  myVote: null,
  results: null,
  points: {},
  ...over,
});

describe("todoFor", () => {
  test("asks for a card until one is played, and falls back to a card from the hand", () => {
    const todo = todoFor(room("worst-feedback", worstFeedback()), "bea");
    expect(todo?.hint).toMatch(/play a card/);
    expect(todo?.hint).toMatch(/"swap".*2 left/);
    expect(todoFor(room("worst-feedback", worstFeedback({ swapsLeft: 0 })), "bea")?.hint).not.toMatch(/swap/);
    expect(botLines(room("worst-feedback", worstFeedback()), "bea", NOW)).toContain('hand: a1: "Soup." · a2: "Vibes." (new)');
    expect(todo?.autoAt).toBe(NOW + 60_000 - 6_000);
    const move = todo!.fallback();
    expect(["a1", "a2"]).toContain(move?.cardId);
    expect(todoFor(room("worst-feedback", worstFeedback({ myAnswer: "Soup." })), "bea")).toBeNull();
  });

  test("votes never fall back to the bot's own answer", () => {
    const ballot = [
      { answerId: "x", text: "Mine", mine: true },
      { answerId: "y", text: "Theirs", mine: false },
    ];
    const todo = todoFor(room("worst-feedback", worstFeedback({ phase: "vote", hand: null, ballot })), "bea");
    for (let i = 0; i < 20; i++) expect(todo!.fallback()).toEqual({ type: "vote", answerId: "y" });
  });

  test("Bot or Not discussion readies late, not at once", () => {
    const view = {
      phase: "discuss",
      endsAt: NOW + 90_000,
      round: 0,
      totalRounds: 3,
      youAreBot: false,
      question: "Q?",
      answeredIds: [],
      myAnswer: "pizza",
      answers: [],
      readyIds: [],
      votedIds: [],
      myVote: null,
      botId: null,
      guess: null,
      reveal: null,
      points: {},
    } satisfies BotOrNotView;
    const todo = todoFor(room("bot-or-not", view), "bea");
    expect(todo?.autoAt).toBe(NOW + 70_000);
    expect(todo?.fallback()).toEqual({ type: "ready" });
  });

  test("Skip Logic asks to look at a drawing before describing it", () => {
    const view = {
      phase: "describe",
      endsAt: NOW + 40_000,
      step: 2,
      totalSteps: 3,
      task: { chain: 0, previous: { kind: "drawing", authorId: "cal", strokes: [], timedOut: false }, done: false },
      suggestions: [],
      submittedIds: [],
      reveal: null,
      points: {},
    } satisfies SkipLogicView;
    const r = room("skip-logic", view);
    expect(todoFor(r, "bea")?.hint).toMatch(/brick look/);
    expect(botLines(r, "bea", NOW)).toContain("you got a drawing by Cal");
  });

  test("In Order plays the lowest card, later for a bigger gap to the pile, and shows only counts of others' cards", () => {
    const inOrder = (over: Partial<InOrderView> = {}): InOrderView => ({
      phase: "play",
      endsAt: NOW + 60_000,
      round: 1,
      totalRounds: 3,
      cardsEach: 2,
      lives: 2,
      maxLives: 3,
      hand: [31, 77],
      holding: { human: 2, bea: 2, cal: 1 },
      plays: [{ playerId: "cal", card: 12, burned: [{ playerId: "human", card: 9 }] }],
      turn: 1,
      top: 12,
      startedAt: NOW,
      since: NOW + 5_000,
      outcome: null,
      leftover: [],
      levelsCleared: 1,
      levelPoints: 0,
      points: {},
      ...over,
    });
    const todo = todoFor(room("in-order", inOrder()), "bea")!;
    expect(todo.hint).toMatch(/"card":31/);
    expect(todo.fallback()).toEqual({ type: "play", card: 31 });
    expect(todo.timed).toBe(true);
    expect(todo.autoAt).toBeGreaterThan(NOW + 5_000);
    const later = todoFor(room("in-order", inOrder({ hand: [77] })), "bea")!;
    expect(later.autoAt).toBeGreaterThan(todo.autoAt);
    // A new card on the pile starts the wait over.
    const moved = todoFor(room("in-order", inOrder({ top: 30, since: NOW + 9_000, turn: 2 })), "bea")!;
    expect(moved.autoAt).toBeLessThan(todo.autoAt + 4_000);
    expect(situationKey(room("in-order", inOrder()))).not.toBe(situationKey(room("in-order", inOrder({ turn: 2 }))));
    expect(todoFor(room("in-order", inOrder({ phase: "ready" })), "bea")).toBeNull();
    expect(todoFor(room("in-order", inOrder({ hand: [] })), "bea")).toBeNull();

    const lines = botLines(room("in-order", inOrder()), "bea", NOW);
    expect(lines[0]).toMatch(/^your cards: 31, 77/);
    const shared = roomLines(room("in-order", inOrder()), () => false, NOW).join("\n");
    expect(shared).toContain("level 2/3 (2 cards each) · lives ♥♥♡");
    expect(shared).toContain("pile: 12 (Cal, too early: threw away Javi's 9)");
    expect(shared).toContain("still holding: Javi 2 · Bea 2 · Cal 1");
    expect(shared).not.toContain("77");
    const over = roomLines(room("in-order", inOrder({ phase: "levelEnd", outcome: "timeout", leftover: [{ playerId: "cal", card: 50 }] })), () => false, NOW).join("\n");
    expect(over).toContain("time ran out · never played: Cal's 50");
  });

  test("Doodle Champions: bots draw a fighter in parts, then bet on fighters they can read", () => {
    let s: DoodleChampionsState = doodleChampions.init({ players: members, content: {}, spice: "mild", seed: 5, now: NOW, pace: 1 }).state;
    const at = (state: DoodleChampionsState, id = "bea") => room("doodle-champions", doodleChampions.view(state, id));
    const drawTodo = todoFor(at(s), "bea")!;
    expect(drawTodo.hint).toMatch(/"draw":"part body;/);
    expect(roomLines(at(s), () => false, NOW).join("\n")).toContain("fighters in: nobody yet");
    for (const id of ["human", "bea", "cal"]) {
      const move = doodleChampionsActionSchema.parse(todoFor(at(s, id), id)!.fallback());
      expect(move.type === "fighter" && move.strokes.some((x) => x.t === "legs" || x.t === "arms" || x.t === "body")).toBe(true);
      s = doodleChampions.reduce(s, { type: "action", playerId: id, action: move, now: NOW }).state;
      if (id === "bea") expect(botLines(at(s), "bea", NOW)).toContain("your fighter is in; waiting for the others");
    }
    // Three players: the dummy fills the fourth seat. The weigh-in lists every fighter by its shapes.
    const weighIn = roomLines(at(s), () => false, NOW).join("\n");
    expect(weighIn).toContain("Doodle Champions · weighin · weigh-in");
    expect(weighIn).toMatch(/#4 "The Training Dummy" by the house: 0 legs, 0 arms, no weapon/);
    expect(weighIn).toMatch(/HP \d+ · speed [\d.]+ · reach \d+/);
    expect(botLines(at(s), "bea", NOW).join("\n")).toMatch(/your fighter: #2 ".+", 0W 0L/);

    s = doodleChampions.reduce(s, { type: "skip", now: NOW }).state;
    const betTodo = todoFor(at(s), "bea")!;
    expect(betTodo.hint).toMatch(/"type":"bet","targetId":FIGHTER,"stake":25\|50\|100/);
    const bet = doodleChampionsActionSchema.parse(betTodo.fallback());
    s = doodleChampions.reduce(s, { type: "action", playerId: "bea", action: bet, now: NOW }).state;
    const betting = roomLines(at(s, "cal"), () => false, NOW).join("\n");
    expect(betting).toMatch(/round 1\/4 \(duels\)/);
    expect(betting).toMatch(/\(targetId "(Javi|Bea|Cal|dummy)", odds x[\d.]+\) vs /);
    expect(betting).toContain("bets in: Bea");
    expect(botLines(at(s), "bea", NOW).join("\n")).toMatch(/your bet: \d+ on ".+"/);
    expect(todoFor(at(s), "bea")).toBeNull();

    s = doodleChampions.reduce(s, { type: "skip", now: NOW }).state;
    expect(roomLines(at(s), () => false, NOW).join("\n")).toMatch(/fighting now: ".+" vs ".+" · ".+" vs ".+"/);
    s = doodleChampions.reduce(s, { type: "skip", now: NOW }).state;
    const results = roomLines(at(s), () => false, NOW).join("\n");
    expect(results).toMatch(/: (".+" wins by (knockout|decision)|a draw)/);
    expect(results).toMatch(/bets: Bea \d+ on ".+" [+-]\d+/);
    expect(results).not.toMatch(/\{\d+\}/);
  });

  test("Doodle Smash: bots draw a fighter and name its weapon, then the autopilot fights while they talk", () => {
    let s: DoodleSmashState = doodleSmash.init({ players: members, content: {}, spice: "mild", seed: 5, now: NOW, pace: 1 }).state;
    const at = (state: DoodleSmashState, id = "bea") => room("doodle-smash", doodleSmash.view(state, id));
    const actor = (id: string, state: DoodleSmashState) => ({ name: id, id, view: at(state, id) });
    const drawTodo = todoFor(at(s), "bea")!;
    expect(drawTodo.hint).toMatch(/"draw":"part body;/);
    expect(drawTodo.hint).toContain('"weapon blaster"');
    expect(doodleSmashActionSchema.parse(drawTodo.fallback()).type).toBe("fighter");
    // The driver draws with shapes and names the weapon in them.
    const drawn = gameMessage(actor("bea", s), drawAction(at(s), "part body; fill circle 500 500 150; part arms; line 650 500 800 450; part weapon; weapon blaster; line 800 450 950 430"));
    const fighter = (drawn as { action: { type: string; weapon: string } }).action;
    expect(fighter).toMatchObject({ type: "fighter", weapon: "blaster" });
    s = doodleSmash.reduce(s, { type: "action", playerId: "bea", action: fighter, now: NOW }).state;
    expect(botLines(at(s), "bea", NOW)).toContain("your fighter is in; waiting for the others");
    s = doodleSmash.reduce(s, { type: "skip", now: NOW }).state;
    const weighIn = roomLines(at(s), () => false, NOW).join("\n");
    expect(weighIn).toMatch(/Doodle Smash · weighin · stage: /);
    expect(weighIn).toMatch(/by Bea: a blaster \(shoots\) · weight [\d.]+ · speed [\d.]+ · jump [\d.]+ · reach \d+/);
    expect(botLines(at(s), "bea", NOW).join("\n")).toMatch(/your fighter: ".+" with a blaster/);

    s = doodleSmash.reduce(s, { type: "skip", now: NOW }).state;
    s = doodleSmash.reduce(s, { type: "tick", now: s.fightStartedAt + (GO_TICK + 1) * SMASH_TICK_MS }).state;
    const fight = at(s);
    expect(todoFor(fight, "bea")).toBeNull();
    expect(situationLine(fight, NOW)).toMatch(/^\[reveal\] Doodle Smash · fight/);
    expect(roomLines(fight, () => false, NOW).join("\n")).toMatch(/fighters \(lives, damage %\): Javi ♥♥♥ 0% · Bea ♥♥♥ 0% · Cal ♥♥♥ 0%/);
    expect(botLines(fight, "bea", NOW)).toContain("the fight is live: the autopilot steers your fighter, so you only talk");
    // The autopilot steers with the same fighter as the server's bots, from the view alone.
    const v = fight.game!.view as ReturnType<typeof doodleSmash.view>;
    expect(smashBot(fightSight(v.fight!, v.me), s.cast, v.me)).toEqual(smashBot(s.fight!, s.cast, 1));
    // Keys are the autopilot's: the driver can't send them.
    expect(() => partsOf(actor("bea", s), { bot: "bea", action: { type: "input", held: 1, seq: 1 } })).toThrow(/autopilot steers/);
  });

  test("Paint Grab paints on the autopilot, quietly and without waking anyone each stroke, and maps the canvas", () => {
    const seats = members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
    let s = paintGrab.init({ players: seats, content: {}, spice: "mild", seed: 1, now: NOW, pace: 1 }).state;
    s = paintGrab.reduce(s, { type: "tick", now: s.phaseEndsAt }).state;
    const start = s.phaseEndsAt;
    s = paintGrab.reduce(s, { type: "action", playerId: "cal", action: { type: "paint", strokes: [[0, 1, 2, 3]] }, now: start - 44_000 }).state;
    const r = room("paint-grab", paintGrab.view(s, "bea"));
    const todo = todoFor(r, "bea")!;
    expect(todo.steady).toBe(true);
    expect(todo.fallback()).toMatchObject({ type: "paint" });
    // Painting doesn't change the moment, so the driver isn't woken for every stroke.
    const after = paintGrab.reduce(s, { type: "action", playerId: "bea", action: todo.fallback(), now: todo.autoAt }).state;
    const r2 = room("paint-grab", paintGrab.view(after, "bea"));
    expect(situationKey(r2)).toBe(situationKey(r));
    expect(todoFor(r2, "bea")!.hint).not.toBe(todo.hint);

    const shared = roomLines(r, () => false, NOW).join("\n");
    expect(shared).toContain("Paint Grab · paint · round 1/2");
    expect(shared).toContain("Cal (C) 0%");
    expect(shared).toContain("  | CC....");
    expect(botLines(r, "bea", NOW)[0]).toMatch(/^you paint B and own 0% of the canvas; the autopilot paints for you/);
  });

  test("Hue Clue tells the clue-giver its colour in words, takes guesses by label, and shows the reveal", () => {
    const seats = members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
    let s: HueClueState = hueClue.init({ players: seats, content: {}, spice: "mild", seed: 2, now: NOW, pace: 1 }).state;
    const giver = s.rounds[0]!.giverId;
    const guesser = ["bea", "cal"].find((id) => id !== giver)!;
    const target = s.rounds[0]!.target;
    const label = cellLabel(target);

    const asGiver = room("hue-clue", hueClue.view(s, giver));
    const giverState = botLines(asGiver, giver, NOW).join("\n");
    expect(giverState).toMatch(new RegExp(`YOU GIVE THE CLUE: your secret colour is ${label} \\(#[0-9a-f]{6}, [a-z -]+\\)`));
    expect(giverState).toContain('TODO give the clue for your secret colour');
    // Nobody else sees it, in the shared lines or their own.
    const asGuesser = room("hue-clue", hueClue.view(s, guesser));
    const guesserState = [...roomLines(asGuesser, () => true, NOW), ...botLines(asGuesser, guesser, NOW)].join("\n");
    expect(guesserState).not.toContain(label);
    expect(guesserState).toContain("is choosing a clue");
    expect(todoFor(asGuesser, guesser)).toBeNull();

    // A colour name is caught before it's sent, with the reason.
    const actor = (id: string, view: MatchView) => ({ name: id, id, view });
    expect(() => gameMessage(actor(giver, asGiver), { type: "clue", text: "yellow" })).toThrow("No colour names");
    const clue = gameMessage(actor(giver, asGiver), { type: "clue", text: "banana" });
    s = hueClue.reduce(s, { type: "action", playerId: giver, action: (clue as { action: unknown }).action, now: NOW }).state;

    const guessing = room("hue-clue", hueClue.view(s, guesser));
    const todo = todoFor(guessing, guesser)!;
    expect(todo.hint).toContain('the clue "banana"');
    expect(todo.hint).toContain('{"type":"guess","cell":"F4","lock":true}');
    expect(roomLines(guessing, () => true, NOW).join("\n")).toContain("board: columns A red, B orange-red");
    // The driver names cells by label; the move goes out as an index.
    const guess = gameMessage(actor(guesser, guessing), { type: "guess", cell: "b3" });
    expect(guess).toEqual({ type: "action", action: { type: "guess", cell: 33 } });
    expect(() => gameMessage(actor(guesser, guessing), { type: "guess", cell: "Q3" })).toThrow('like "F4"');
    s = hueClue.reduce(s, { type: "action", playerId: guesser, action: { type: "guess", cell: 33 }, now: NOW }).state;
    expect(botLines(room("hue-clue", hueClue.view(s, guesser)), guesser, NOW).join("\n")).toContain("your pin: B3 (#");

    s = hueClue.reduce(s, { type: "tick", now: s.phaseEndsAt + 2_000 }).state;
    const shared = roomLines(room("hue-clue", hueClue.view(s, guesser)), () => true, NOW).join("\n");
    expect(shared).toContain(`the colour was ${label}`);
    expect(shared).toMatch(/pins: .*B3/);
  });

  test("Make It Worse shows the palette while building, then autopilots the form and shows the reveal", () => {
    const seats = members.map(({ id, name, avatar }) => ({ id, name, avatar }));
    const survey = {
      id: "mw-t",
      title: "Lunch survey",
      intro: "Tell us about lunch.",
      questions: [
        { kind: "choice" as const, label: "Lunch", text: "What did you have?", options: ["Soup", "Salad", "Noodles"] },
        { kind: "rating" as const, label: "Taste", text: "How did it taste?", low: "Awful", high: "Amazing" },
        { kind: "number" as const, label: "Bites", text: "How many bites?", min: 1, max: 60, unit: "bites" },
        { kind: "consent" as const, label: "Newsletter", text: "Email me the newsletter", thing: "the newsletter" },
      ],
    };
    let s: MakeItWorseState = makeItWorse.init({ players: seats, content: { surveys: [survey] }, spice: "mild", seed: 4, now: NOW, pace: 1 }).state;
    const building = botLines(room("make-it-worse", makeItWorse.view(s, "bea")), "bea", NOW).join("\n");
    expect(building).toContain("trap palette (budget 7");
    expect(building).toContain("runaway 2 (whole form");
    expect(building).toContain("reversed 1 (on a rating question");
    expect(building).toContain("your form: no traps yet · 0 of 7 points spent, 7 left");
    expect(building).toContain('TODO build your form and lock it: {"type":"form"');
    expect(roomLines(room("make-it-worse", makeItWorse.view(s, "bea")), () => true, NOW).join("\n")).toContain('Q1 rating "How did it taste?"');
    for (const id of ["human", "bea", "cal"]) {
      s = makeItWorse.reduce(s, { type: "action", playerId: id, action: { type: "form", traps: [{ trap: "ghost", question: 1 }, { trap: "captcha" }], lock: true }, now: NOW }).state;
    }
    while (s.phase !== "play") s = makeItWorse.reduce(s, { type: "tick", now: s.phaseEndsAt }).state;
    const filler = s.run!.fillers.find((id) => id !== "human")!;
    const playing = room("make-it-worse", makeItWorse.view(s, filler));
    const t = todoFor(playing, filler)!;
    expect(t.timed && t.steady).toBe(true);
    expect(botLines(playing, filler, NOW).join("\n")).toContain("the autopilot clicks through it for you");
    const shared = roomLines(playing, () => true, NOW).join("\n");
    expect(shared).toContain("Ghost text on Q1 (Taste), Impossible CAPTCHA");
    expect(shared).toMatch(/sticky note: Lunch "(Soup|Salad|Noodles)" · Taste \d of 5 · Bites \d+ bites · Newsletter (yes|no)/);
    expect(shared).toContain("/6");
    s = makeItWorse.reduce(s, { type: "tick", now: s.phaseEndsAt }).state;
    const reveal = roomLines(room("make-it-worse", makeItWorse.view(s, filler)), () => true, NOW).join("\n");
    expect(reveal).toContain("SUED");
    expect(reveal).toContain("Impossible CAPTCHA: caught nobody · trick:");
    expect(situationLine(room("make-it-worse", makeItWorse.view(s, filler)), NOW)).toMatch(/^\[reveal\] Make It Worse · reveal round 1\/3/);
  });

  test("spectators have nothing to do", () => {
    const r = room("worst-feedback", worstFeedback());
    r.game!.players = ["human", "cal"];
    expect(todoFor(r, "bea")).toBeNull();
    expect(botLines(r, "bea", NOW)).toContain("watching this game (not playing)");
  });
});

describe("situations", () => {
  test("the key changes with the phase and round, not with the clock", () => {
    const a = room("worst-feedback", worstFeedback());
    const b = room("worst-feedback", worstFeedback({ endsAt: NOW + 1 }));
    const c = room("worst-feedback", worstFeedback({ phase: "vote" }));
    expect(situationKey(a)).toBe(situationKey(b));
    expect(situationKey(a)).not.toBe(situationKey(c));
  });

  test("lines tag turns and reveals", () => {
    expect(situationLine(room("worst-feedback", worstFeedback()), NOW)).toBe("[turn] Worst Feedback Ever · answer round 1/3 · 60s left");
    expect(situationLine(room("worst-feedback", worstFeedback({ phase: "results" })), NOW)).toMatch(/^\[reveal\]/);
  });

  test("Bot or Not reveals show the round, Skip Logic reveals the chain", () => {
    const reveal = { realQuestion: "Q?", botQuestion: "B?", caught: false, verdict: null, tally: [], roundPoints: {} };
    const botOrNot = { phase: "results", endsAt: NOW + 12_000, round: 1, totalRounds: 3, reveal } as unknown as BotOrNotView;
    expect(situationLine(room("bot-or-not", botOrNot), NOW)).toBe("[reveal] Bot or Not · results round 2/3 · 12s left");

    const chain = { chain: 0, totalChains: 3, ownerId: "bea", entries: [], hearts: {}, myHeart: null, verdicts: {} };
    const skipLogic = { phase: "reveal", endsAt: NOW + 8_000, step: 5, totalSteps: 6, reveal: chain } as unknown as SkipLogicView;
    expect(situationLine(room("skip-logic", skipLogic), NOW)).toBe("[reveal] Skip Logic · reveal chain 1/3 · 8s left");
  });
});

describe("pauses", () => {
  test("the event line says the game is paused and moves wait", () => {
    const view = { ...room("worst-feedback", worstFeedback()), paused: true };
    expect(situationLine(view, NOW)).toMatch(/^\[paused\].*moves wait/);
  });
});
