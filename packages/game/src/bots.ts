import { drawShapes } from "./draw-shapes";
import type { BotOrNotView } from "./games/bot-or-not";
import {
  DIRECTIONS,
  onArena,
  resolveTurn,
  type BrawlMove,
  type BrawlRound,
  type BrickBrawlView,
  type Direction,
} from "./games/brick-brawl";
import type { DoodleChampionsView } from "./games/doodle-champions";
import { DOODLE_LIMITS, randomFighterShapes } from "./games/doodle-fighter";
import type { DoodleSmashView } from "./games/doodle-smash";
import type { FakeArtistView } from "./games/fake-artist";
import type { HueClueView } from "./games/hue-clue";
import { HUE_COLORS, cellLabel, describeCell } from "./games/hue-grid";
import { botClue, botGuess } from "./games/hue-words";
import type { InOrderView } from "./games/in-order";
import {
  TRAPS,
  randomForm,
  type MakeItWorseView,
  type MiwAnswer,
  type MiwQuestion,
  type PlacedTrap,
  type TrapId,
} from "./games/make-it-worse";
import type { PaintGrabView } from "./games/paint-grab";
import type { SkipLogicView } from "./games/skip-logic";
import type { SurveySaysView } from "./games/survey-says";
import type { WorstFeedbackView } from "./games/worst-feedback";
import type { MatchView } from "./match";
import type { GameId, PlayerId } from "./types";

/**
 * What bots do: the move each game still needs from a player, with a simple move to play for them. The CLI's
 * autopilot plays these when a bot runs out of time, and "Test it" rooms play them for their server-side bots.
 */

/** Something a player still has to do in the current phase. */
export interface Todo {
  /** How to do it, for the CLI's `state`. */
  hint: string;
  /** When the phase ends (server time). */
  endsAt: number;
  /** When the CLI's autopilot steps in if nobody has (server time). */
  autoAt: number;
  /** A simple move for this player, as the game's action, or `null` when there's nothing sensible to play. */
  fallback: (random?: () => number) => Record<string, unknown> | null;
  /**
   * The move's timing is part of the move (In Order): bots make it at `autoAt` exactly, not as soon as they've thought
   * about it.
   */
  timed?: boolean;
  /**
   * A move the player keeps making all phase long (Paint Grab's brush strokes), timed like `timed`. Each one comes
   * with a new hint, and none is a missed deadline, so the CLI's autopilot makes them without a word.
   */
  steady?: boolean;
}

/** Seconds before a deadline when the CLI's autopilot plays a fallback move. */
const AUTOPILOT_MARGIN_MS = 6_000;

const FALLBACK_ANSWERS = [
  "pizza",
  "probably 3",
  "Mondays",
  "my cat",
  "coffee, obviously",
  "no idea tbh",
  "Slack",
  "the weekend",
  "42",
];
const FALLBACK_DOODLES = [
  "size thick; circle 500 500 220; dot 430 450; dot 570 450; arc 500 520 90 20 160",
  "size thick; poly 200 700 350 300 500 700 650 300 800 700",
  "color teal; size huge; fill circle 500 520 180; color ink; size medium; line 500 340 500 200; circle 500 170 30",
];

function pickWith<T>(random: () => number, items: readonly T[]): T | undefined {
  return items[Math.floor(random() * items.length)];
}

const todo = (
  endsAt: number,
  hint: string,
  fallback: Todo["fallback"],
  autoAt = endsAt - AUTOPILOT_MARGIN_MS,
): Todo => ({
  hint,
  endsAt,
  autoAt,
  fallback,
});

/** The game currently running, and its view for this player, if a game is on. */
function current(view: MatchView): { gameId: GameId; game: unknown } | null {
  return view.phase === "playing" && view.game ? { gameId: view.game.gameId, game: view.game.view } : null;
}

/** A key that changes whenever the room moves on: a new phase, round, step, turn or revealed chain. */
export function situationKey(view: MatchView): string {
  const g = current(view);
  const v = (g?.game ?? {}) as {
    phase?: string;
    round?: number;
    step?: number;
    turn?: number;
    reveal?: { chain: number } | null;
  };
  return [view.phase, view.index, g?.gameId, v.phase, v.round ?? v.step, v.turn, v.reveal?.chain].join("|");
}

/** What's required of `me` right now, if anything. Optional moves (chat, hearts, reactions) aren't todos. */
export function todoFor(view: MatchView, me: PlayerId): Todo | null {
  const g = current(view);
  if (!g || !view.game?.players.includes(me)) return null;
  switch (g.gameId) {
    case "worst-feedback":
      return worstFeedbackTodo(g.game as WorstFeedbackView);
    case "bot-or-not":
      return botOrNotTodo(g.game as BotOrNotView, me);
    case "survey-says":
      return surveySaysTodo(g.game as SurveySaysView);
    case "skip-logic":
      return skipLogicTodo(g.game as SkipLogicView);
    case "fake-artist":
      return fakeArtistTodo(g.game as FakeArtistView, me);
    case "brick-brawl":
      return brickBrawlTodo(g.game as BrickBrawlView, me);
    case "in-order":
      return inOrderTodo(g.game as InOrderView, me);
    case "doodle-champions":
      return doodleChampionsTodo(g.game as DoodleChampionsView, me);
    case "paint-grab":
      return paintGrabTodo(g.game as PaintGrabView, me);
    case "hue-clue":
      return hueClueTodo(g.game as HueClueView);
    case "doodle-smash":
      return doodleSmashTodo(g.game as DoodleSmashView, me);
    case "make-it-worse":
      return makeItWorseTodo(g.game as MakeItWorseView, me);
  }
}

function worstFeedbackTodo(v: WorstFeedbackView): Todo | null {
  if (v.phase === "answer" && v.hand && !v.myAnswer) {
    const swap = v.swapsLeft
      ? `; first, if you like, trade a weak card {"type":"swap","cardId":ID} (${v.swapsLeft} left this game)`
      : "";
    return todo(
      v.endsAt,
      `play a card {"type":"play","cardId":ID} or write one {"type":"write","text":"..."} (max 140)${swap}`,
      (random = Math.random) => {
        const card = pickWith(random, v.hand ?? []);
        return card ? { type: "play", cardId: card.id } : null;
      },
    );
  }
  if (v.phase === "vote" && v.ballot && !v.myVote && v.ballot.some((b) => !b.mine)) {
    return todo(
      v.endsAt,
      `vote for the funniest {"type":"vote","answerId":ID} (not your own)`,
      (random = Math.random) => {
        const answer = pickWith(
          random,
          (v.ballot ?? []).filter((b) => !b.mine),
        );
        return answer ? { type: "vote", answerId: answer.answerId } : null;
      },
    );
  }
  return null;
}

function botOrNotTodo(v: BotOrNotView, me: PlayerId): Todo | null {
  if (v.youAreBot === null) return null;
  if (v.phase === "answer" && !v.myAnswer) {
    return todo(
      v.endsAt,
      `answer {"type":"answer","text":"..."} (max 80, short like a real answer)`,
      (random = Math.random) => ({
        type: "answer",
        text: pickWith(random, FALLBACK_ANSWERS)!,
      }),
    );
  }
  if (v.phase === "discuss" && !v.readyIds.includes(me)) {
    // Not required: discussion ends on time anyway. The autopilot says it's ready late in the phase.
    return todo(
      v.endsAt,
      `optional: chat your suspicions, then {"type":"ready"} to end the discussion early`,
      () => ({ type: "ready" }),
      v.endsAt - 20_000,
    );
  }
  if (v.phase === "vote" && !v.myVote) {
    const others = (v.answers ?? []).filter((a) => a.playerId !== me);
    return todo(
      v.endsAt,
      `vote for who you think is the Bot {"type":"vote","targetId":NAME}`,
      (random = Math.random) => {
        const target = pickWith(random, others);
        return target ? { type: "vote", targetId: target.playerId } : null;
      },
    );
  }
  if (v.phase === "guess" && v.botId === me && v.guess === null) {
    return todo(
      v.endsAt,
      `you were caught: guess the real question {"type":"guess","text":"..."} (max 160)`,
      () => ({
        type: "guess",
        text: "something about work?",
      }),
    );
  }
  return null;
}

function surveySaysTodo(v: SurveySaysView): Todo | null {
  if (v.phase !== "answer" || v.mySubmission) return null;
  const q = v.question;
  const value = q.kind === "scale" ? "0-10" : q.kind === "who" ? "NAME" : "KEY";
  return todo(
    v.endsAt,
    `answer and predict the team's top answer {"type":"submit","answer":${value},"prediction":${value}}`,
    (random = Math.random) => {
      const option = () =>
        q.kind === "scale" ? Math.floor(random() * 11) : (pickWith(random, q.options)?.key ?? "0");
      return { type: "submit", answer: option(), prediction: option() };
    },
  );
}

function skipLogicTodo(v: SkipLogicView): Todo | null {
  if (!v.task || v.task.done) return null;
  if (v.phase === "write") {
    return todo(
      v.endsAt,
      `write a survey question that's fun to draw {"type":"write","text":"..."} (max 120)`,
      (random = Math.random) => ({
        type: "write",
        text: pickWith(random, v.suggestions) ?? "What's your favorite snack?",
      }),
    );
  }
  if (v.phase === "draw") {
    return todo(
      v.endsAt,
      `draw the text above with shapes {"draw":"..."} (see \`brick shapes\`)`,
      (random = Math.random) => ({
        type: "draw",
        strokes: drawShapes(pickWith(random, FALLBACK_DOODLES)!, random),
      }),
    );
  }
  if (v.phase === "describe") {
    return todo(
      v.endsAt,
      `run \`brick look BOT\`, then describe the drawing as a survey question {"type":"describe","text":"..."} (max 120)`,
      () => ({
        type: "describe",
        text: "a mysterious doodle doing something?",
      }),
    );
  }
  return null;
}

/** A gentle curve somewhere near the middle of the canvas: a fallback line that commits to nothing. */
function squiggle(random: () => number): number[] {
  const at = () => 250 + Math.round(random() * 500);
  const [x1, y1, cx, cy, x2, y2] = [at(), at(), at(), at(), at(), at()];
  const points: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const u = 1 - t;
    points.push(
      Math.round(u * u * x1 + 2 * u * t * cx + t * t * x2),
      Math.round(u * u * y1 + 2 * u * t * cy + t * t * y2),
    );
  }
  return points;
}

function fakeArtistTodo(v: FakeArtistView, me: PlayerId): Todo | null {
  if (v.youAreFake === null) return null;
  if (v.phase === "draw" && v.drawerId === me) {
    const hint = v.youAreFake
      ? `YOUR TURN, and you're the fake: add ONE line that fits "${v.category}" without committing as the item's own "draw" field {"bot":NAME,"draw":"..."} (one line, poly, curve, arc or outline; see \`brick shapes\`)`
      : `YOUR TURN: add ONE line to the drawing of "${v.word}" as the item's own "draw" field {"bot":NAME,"draw":"..."} (one line, poly, curve, arc or outline; see \`brick shapes\`)`;
    return todo(
      v.endsAt,
      hint,
      (random = Math.random) => ({ type: "line", points: squiggle(random) }),
      v.endsAt - 4_000,
    );
  }
  if (v.phase === "vote" && !v.myVote) {
    const others = v.turns.filter((id, i) => id !== me && v.turns.indexOf(id) === i);
    return todo(
      v.endsAt,
      `vote for who you think is the fake {"type":"vote","targetId":NAME}`,
      (random = Math.random) => {
        const target = pickWith(random, others);
        return target ? { type: "vote", targetId: target } : null;
      },
    );
  }
  if (v.phase === "guess" && v.fakeId === me && v.guess === null) {
    return todo(
      v.endsAt,
      `you were caught: guess the word (category "${v.category}") {"type":"guess","text":"..."} (max 40)`,
      () => ({
        type: "guess",
        text: "no idea",
      }),
    );
  }
  return null;
}

const BRAWL_MOVES: BrawlMove[] = [
  { type: "stay" },
  { type: "block" },
  ...(Object.keys(DIRECTIONS) as Direction[]).flatMap((dir) => [
    { type: "step" as const, dir },
    { type: "dash" as const, dir },
    { type: "shove" as const, dir },
  ]),
];

/** Tiles between a brick and the crumbling edge. */
const edgeRoom = (v: Pick<BrickBrawlView, "size" | "ring">, x: number, y: number) =>
  Math.min(x - v.ring, y - v.ring, v.size - v.ring - 1 - x, v.size - v.ring - 1 - y);

/**
 * A decent move for `me`: tries every move against everyone else standing still, and prefers knocking bricks off,
 * not falling, keeping away from the edge, and blocking when a neighbor could shove it off. Ties break at random.
 */
export function brawlMove(v: BrickBrawlView, me: PlayerId, random: () => number = Math.random): BrawlMove {
  const mine = v.bricks.find((b) => b.id === me && b.outAt === null);
  if (!mine) return { type: "stay" };
  const others = v.bricks.filter((b) => b.outAt === null && b.id !== me);
  // A neighbor shoving me sends me 2 tiles; if that's off the arena, I'm in danger where I stand.
  const danger = (x: number, y: number) =>
    others.some((o) =>
      (Object.values(DIRECTIONS) as (readonly [number, number])[]).some(
        ([dx, dy]) => o.x === x - dx && o.y === y - dy && !onArena(v, x + 2 * dx, y + 2 * dy),
      ),
    );
  const scored = BRAWL_MOVES.map((move) => {
    const round: BrawlRound = {
      size: v.size,
      ring: v.ring,
      turn: v.turn,
      bricks: v.bricks.map((b) => ({ ...b })),
      moves: { [me]: move },
      drops: {},
      events: [],
      roundPoints: {},
      placing: null,
    };
    resolveTurn(round, {});
    const after = round.bricks.find((b) => b.id === me)!;
    if (after.outAt !== null) return { move, score: -100 };
    const knocked = round.bricks.filter(
      (b) => b.id !== me && b.outAt !== null && v.bricks.find((x) => x.id === b.id)?.outAt === null,
    ).length;
    const room = edgeRoom(round, after.x, after.y);
    const risky = move.type !== "block" && danger(after.x, after.y);
    return {
      move,
      score:
        knocked * 10 +
        Math.min(room, 2) -
        (risky ? 4 : 0) +
        (move.type === "block" && danger(mine.x, mine.y) ? 1 : 0),
    };
  });
  const best = Math.max(...scored.map((c) => c.score));
  const top = scored.filter((c) => c.score >= best - 0.5);
  return top[Math.floor(random() * top.length)]!.move;
}

function brickBrawlTodo(v: BrickBrawlView, me: PlayerId): Todo | null {
  if (v.phase !== "plan") return null;
  const mine = v.bricks.find((b) => b.id === me);
  if (!mine) return null;
  if (mine.outAt !== null) {
    if (v.myDrop) return null;
    const targets = v.bricks.filter((b) => b.outAt === null);
    return todo(
      v.endsAt,
      `you're out: drop a brick on a tile to daze whoever stands there {"type":"drop","x":X,"y":Y}`,
      (random = Math.random) => {
        const target = pickWith(random, targets);
        return target ? { type: "drop", x: target.x, y: target.y } : null;
      },
      v.endsAt - 4_000,
    );
  }
  if (mine.dazed || v.myMove) return null;
  return todo(
    v.endsAt,
    `pick your move {"type":"step"|"dash"|"shove","dir":"up"|"down"|"left"|"right"} or {"type":"block"} or {"type":"stay"}`,
    (random = Math.random) => brawlMove(v, me, random),
    v.endsAt - 4_000,
  );
}

/** A steady 0..1 from a few numbers, so a bot's timing doesn't change each time the room looks again. */
function wobble(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * How long after the pile last changed a calm player waits before playing `card`: a beat, plus time for every number
 * between the top of the pile and the card, give or take a fifth. It scales with the level's time limit, so it follows
 * the game's pace, and a level's waits add up to well under its limit. Close cards in different hands sometimes come
 * out in the wrong order, as they would with people.
 */
export function inOrderWait(v: Pick<InOrderView, "endsAt" | "startedAt" | "top" | "round">, card: number, seat = ""): number {
  const span = Math.max(1000, v.endsAt - v.startedAt);
  const jitter = 0.8 + 0.4 * wobble(seat, card, v.round);
  return Math.round(span * (0.015 + 0.003 * Math.max(0, card - v.top) * jitter));
}

function inOrderTodo(v: InOrderView, me: PlayerId): Todo | null {
  const card = v.hand?.[0];
  if (v.phase !== "play" || card === undefined) return null;
  return {
    hint: `play your lowest card when the moment feels right {"type":"play","card":${card}}; the autopilot times it by the gap to the pile, so you can leave it`,
    endsAt: v.endsAt,
    autoAt: Math.min(v.since + inOrderWait(v, card, me), v.endsAt - 1000),
    fallback: () => ({ type: "play", card }),
    timed: true,
  };
}

/**
 * A sensible bet: usually on a favorite (the lowest odds), now and then on a long shot, with a middling stake. Never
 * on nothing, so a bot always has something riding on the round.
 */
export function doodleBet(v: Pick<DoodleChampionsView, "matches" | "odds" | "stakes">, random: () => number = Math.random) {
  const ids = v.matches.flat();
  if (!ids.length) return null;
  const byOdds = [...ids].sort((a, b) => (v.odds[a] ?? 1) - (v.odds[b] ?? 1) || a.localeCompare(b));
  const longShot = random() < 0.3;
  const pool = longShot ? byOdds.slice(Math.floor(byOdds.length / 2)) : byOdds.slice(0, Math.max(1, Math.ceil(byOdds.length / 2)));
  const targetId = pickWith(random, pool)!;
  const stakes = v.stakes.length ? v.stakes : [50];
  const stake = longShot ? stakes[0]! : (pickWith(random, stakes.slice(0, 2).concat(stakes.slice(1))) ?? stakes[0]!);
  return { type: "bet", targetId, stake };
}

function doodleChampionsTodo(v: DoodleChampionsView, me: PlayerId): Todo | null {
  if (v.phase === "draw" && !v.submittedIds.includes(me)) {
    return todo(
      v.endsAt,
      `draw your fighter part by part as the item's own "draw" field {"bot":NAME,"draw":"part body; color teal; fill circle 500 520 170; ...; part legs; line 440 680 400 900; ..."}: a body (required), then legs, arms and a weapon as you like; colors: ink, white, coral, sun, teal, sky, grape, pink, gray; shapes set the stats (\`brick shapes\`)`,
      (random = Math.random) => ({
        type: "fighter",
        strokes: drawShapes(randomFighterShapes(random), random, DOODLE_LIMITS),
      }),
    );
  }
  if (v.phase === "bet" && !v.myBet && v.matches.length) {
    return todo(
      v.endsAt,
      `bet on a fighter in this round {"type":"bet","targetId":FIGHTER,"stake":${v.stakes.join("|")}} (FIGHTER is its owner's name, or "dummy"; \`brick look BOT\` shows the fighters; a win pays stake x odds, a loss costs the stake)`,
      (random = Math.random) => doodleBet(v, random),
      v.endsAt - 4_000,
    );
  }
  return null;
}

/**
 * Doodle Smash's only turn is the drawing: the fight is live, and bots fight through the game's own `botInput` (on the
 * server) or the CLI's autopilot, never through todos.
 */
function doodleSmashTodo(v: DoodleSmashView, me: PlayerId): Todo | null {
  if (v.phase !== "draw" || v.submittedIds.includes(me)) return null;
  return todo(
    v.endsAt,
    `draw your fighter part by part as the item's own "draw" field {"bot":NAME,"draw":"part body; color teal; fill circle 500 520 170; ...; part legs; line 440 680 400 900; ...; part weapon; weapon blaster; line 700 500 900 480"}: a body (required), then legs, arms and a weapon as you like; colors: ink, white, coral, sun, teal, sky, grape, pink, gray; "weapon blade" (hits up close) or "weapon blaster" (shoots) says what the weapon is, blade if left out; shapes set the stats (\`brick shapes\`)`,
    (random = Math.random) => {
      const shapes = randomFighterShapes(random);
      return { type: "fighter", strokes: drawShapes(shapes, random, DOODLE_LIMITS), weapon: random() < 0.5 ? "blade" : "blaster" };
    },
  );
}

/** How long a bot's brush waits between batches: about three a second, a little uneven. */
export function paintGrabGap(me: PlayerId, strokes: number): number {
  return 280 + Math.round(170 * wobble(me, strokes, "gap"));
}

/** Cells a bot's brush moves per batch: about 15 a second, well inside the brush's ink. */
const PAINT_BOT_STEP = 5;
const PAINT_DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * A bot's next brush stroke. Its path is square loops (which fill in when they close), each followed by a short trip
 * toward a new spot, worked out from the bot's own batch count and brush position, so it needs nothing but its view.
 * A step off the canvas turns back, which can leave a loop open, as it would for people near the edge.
 */
export function paintGrabStroke(v: Pick<PaintGrabView, "width" | "height" | "round" | "me">, me: PlayerId): number[] {
  const { width: w, height: h, round } = v;
  const side = 6 + Math.floor(wobble(me, round, "side") * 5);
  const trip = 4 + Math.floor(wobble(me, round, "trip") * 6);
  const cycle = 4 * side + trip;
  const startX = 6 + Math.floor(wobble(me, round, "x") * (w - 12));
  const startY = 6 + Math.floor(wobble(me, round, "y") * (h - 12));
  let pos = v.me?.last ?? startY * w + startX;
  const cells = v.me?.last === null || !v.me ? [pos] : [];
  for (let i = 0; i < PAINT_BOT_STEP; i++) {
    const k = (v.me?.strokes ?? 0) * PAINT_BOT_STEP + i;
    const loop = Math.floor(k / cycle);
    const r = k % cycle;
    const x = pos % w;
    const y = Math.floor(pos / w);
    let dir: [number, number];
    if (r < 4 * side) {
      const base = Math.floor(wobble(me, round, loop, "dir") * 4);
      const turn = wobble(me, round, loop, "turn") < 0.5 ? 1 : 3;
      dir = PAINT_DIRS[(base + Math.floor(r / side) * turn) % 4]!;
    } else {
      const tx = 4 + Math.floor(wobble(me, round, loop, "tx") * (w - 8));
      const ty = 4 + Math.floor(wobble(me, round, loop, "ty") * (h - 8));
      dir = Math.abs(tx - x) >= Math.abs(ty - y) ? [Math.sign(tx - x) || 1, 0] : [0, Math.sign(ty - y)];
    }
    let nx = x + dir[0];
    let ny = y + dir[1];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      nx = x - dir[0];
      ny = y - dir[1];
    }
    pos = ny * w + nx;
    cells.push(pos);
  }
  return cells;
}

function paintGrabTodo(v: PaintGrabView, me: PlayerId): Todo | null {
  if (v.phase !== "paint" || !v.me) return null;
  const n = v.me.strokes;
  const autoAt = v.me.at + paintGrabGap(me, n);
  // A stroke due after the bell would only be refused.
  if (autoAt >= v.endsAt) return null;
  return {
    hint: `nothing: the autopilot paints for you all round (stroke ${n + 1})`,
    endsAt: v.endsAt,
    autoAt,
    fallback: () => ({ type: "paint", strokes: [paintGrabStroke(v, me)] }),
    timed: true,
    steady: true,
  };
}

/** How the Hue Clue board runs, for hints: what a cell label means. */
export const HUE_BOARD_HINT =
  'cells are a column A-P and a row 1-10, like "F4": columns run red, orange, yellow, green, aqua, blue, purple to pink; rows run from pale (1) to dark (10)';

function hueClueTodo(v: HueClueView): Todo | null {
  if (v.youGive === null) return null;
  if (v.phase === "clue" && v.youGive && v.target !== null) {
    const target = v.target;
    return todo(
      v.endsAt,
      `give the clue for your secret colour ${cellLabel(target)} (${HUE_COLORS[target]}, ${describeCell(target)}): {"type":"clue","text":"..."}, one or two words naming a thing of that colour, never a colour name or a number`,
      (random = Math.random) => ({ type: "clue", text: botClue(target, random) }),
    );
  }
  if (v.phase === "guess" && !v.youGive && v.clue !== null && !v.myPin?.locked) {
    const clue = v.clue;
    const pin = v.myPin;
    return todo(
      v.endsAt,
      pin
        ? `your pin is on ${cellLabel(pin.cell)}: move it {"type":"guess","cell":"F4"} or lock it in {"type":"guess","cell":"${cellLabel(pin.cell)}","lock":true} (it counts anyway when time runs out)`
        : `tap the colour for the clue ${JSON.stringify(clue)}: {"type":"guess","cell":"F4","lock":true}, leaving out "lock" if you may move it; ${HUE_BOARD_HINT}`,
      (random = Math.random) => ({ type: "guess", cell: pin ? pin.cell : botGuess(clue, random), lock: true }),
    );
  }
  return null;
}

/** One step of a bot filling in a Make It Worse form: how long it takes (in a 75-second form), and what it's stuck on. */
interface MiwBotStep {
  seconds: number;
  stuck: TrapId | null;
}

/**
 * How a bot gets through a form, one step per checkpoint: the modal loop first, then each question (slower under a
 * trap, and every one slower in a Tab maze), then the terms and the CAPTCHA, then Submit with whatever guards it.
 */
export function miwBotSteps(questions: readonly MiwQuestion[], traps: readonly PlacedTrap[]): MiwBotStep[] {
  const has = (id: TrapId) => traps.some((t) => t.trap === id);
  const gate = (id: TrapId): MiwBotStep[] => (has(id) ? [{ seconds: TRAPS[id].botSeconds, stuck: id }] : []);
  const maze = has("tabmaze") ? TRAPS.tabmaze.botSeconds / Math.max(1, questions.length) : 0;
  const steps: MiwBotStep[] = [...gate("modals")];
  questions.forEach((_, i) => {
    const here = traps.filter((t) => t.question === i);
    steps.push({
      seconds: 2.5 + maze + here.reduce((n, t) => n + TRAPS[t.trap].botSeconds, 0),
      stuck: here[0]?.trap ?? (maze ? "tabmaze" : null),
    });
  });
  steps.push(...gate("terms"), ...gate("captcha"));
  const guards = (["runaway", "disguised", "confirmshame"] as const).filter(has);
  steps.push({ seconds: 1.5 + guards.reduce((n, id) => n + TRAPS[id].botSeconds, 0), stuck: guards[0] ?? null });
  return steps;
}

/** A plausible wrong answer: the next option, the mirrored rating, a slider a few steps off, the box flipped. */
function miwWrong(q: MiwQuestion, a: MiwAnswer, random: () => number): MiwAnswer {
  switch (q.kind) {
    case "choice":
      return ((a as number) + 1) % q.options.length;
    case "rating":
      return 6 - (a as number);
    case "number":
      return Math.min(q.max, Math.max(q.min, (a as number) + (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 3))));
    case "consent":
      return !a;
  }
}

function makeItWorseTodo(v: MakeItWorseView, me: PlayerId): Todo | null {
  if (v.phase === "build" && v.myForm && !v.myForm.locked) {
    return todo(
      v.endsAt,
      `build your form and lock it: {"type":"form","traps":[{"trap":"runaway"},{"trap":"ghost","question":0}],"lock":true}, within ${v.budget} points, each trap once, question traps on a question of their kind (the palette is in your state)`,
      (random = Math.random) => ({ type: "form", traps: randomForm(v.survey, random), lock: true }),
    );
  }
  const run = v.run;
  if (v.phase !== "play" || !run?.youFill || run.submitted) return null;
  const steps = miwBotSteps(v.survey.questions, run.form.traps);
  const done = Math.min(run.progress[me]?.done ?? 0, steps.length - 1);
  // Each bot has its own pace, steady for the whole form; the steps scale with the form's time limit.
  const scale = ((v.endsAt - run.startedAt) / 75_000) * 1000 * (0.75 + 0.5 * wobble(me, run.form.designerId));
  const due = run.startedAt + Math.round(steps.slice(0, done + 1).reduce((n, s) => n + s.seconds, 0) * scale);
  const last = done === steps.length - 1;
  return {
    hint: `nothing: the autopilot fills in the form for you (step ${done + 1} of ${steps.length})`,
    endsAt: v.endsAt,
    autoAt: Math.min(due, v.endsAt - 1000),
    fallback: (random = Math.random) => {
      if (!last) return { type: "progress", done: done + 1, stuck: steps[done + 1]?.stuck ?? null };
      // Reading traps sometimes win; the others sometimes cost a click or two on the way.
      const answers = v.survey.questions.map((q, i) => {
        const a = run.answers[i] ?? null;
        const reading = run.form.traps.some((t) => t.question === i && TRAPS[t.trap].reading);
        return reading && random() < 0.3 ? miwWrong(q, a, random) : a;
      });
      const fell = run.form.traps
        .filter((t) => !TRAPS[t.trap].reading && t.trap !== "confirmshame" && random() < 0.6)
        .map((t) => t.trap);
      const upsold = run.form.traps.some((t) => t.trap === "confirmshame") && random() < 0.25;
      return { type: "submit", answers, fell, upsold };
    },
    timed: true,
    steady: true,
  };
}
