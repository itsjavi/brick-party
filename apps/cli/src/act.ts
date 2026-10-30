import {
  DOODLE_LIMITS,
  GAMES,
  REACTIONS,
  drawShapes,
  shapesWeapon,
  type ClientMessage,
  type MatchView,
  type Reaction,
  type SurveySaysView,
} from "@brick/game";

/** One bot's moves, as `act` takes them: at most one of action, draw or ready, plus a chat line (say), a reaction (react), or both. */
export interface ActItem {
  bot: string;
  /** Seconds to wait first. Defaults to a human-like pause for each kind of move. */
  delay?: number;
  action?: Record<string, unknown>;
  draw?: string;
  say?: string;
  react?: string;
  target?: string;
  ready?: boolean;
}

/** One message from an `act` item, with its human-like pause in seconds. */
export interface Part {
  message: ClientMessage;
  what: string;
  /** A game move: it waits for its turn and is dropped if the phase ends first. */
  move: boolean;
  delay: number;
}

/** The bot an item is for, as the room shows it. */
export interface Actor {
  name: string;
  id: string;
  view: MatchView;
}

const CHAT_MAX = 280;
/** Action fields that name a player; `act` accepts names there and swaps in ids. */
const PLAYER_FIELDS = ["targetId", "answer", "prediction"];

export const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Swaps player names for ids in the fields that name players. */
function withIds(action: Record<string, unknown>, view: MatchView): Record<string, unknown> {
  const out = { ...action };
  for (const field of PLAYER_FIELDS) {
    const value = out[field];
    if (typeof value !== "string") continue;
    const member = view.members.find((m) => m.name.toLowerCase() === value.trim().toLowerCase());
    if (member) out[field] = member.id;
  }
  return out;
}

/**
 * Survey Says takes a number or a string for every answer, but only one of them fits the question: a scale answer
 * sent as "8" passes the schema and the game silently drops it. Catch that here, naming what the question takes.
 */
function checkSurveySays(view: SurveySaysView, action: Record<string, unknown>) {
  const { kind, options } = view.question;
  for (const field of ["answer", "prediction"] as const) {
    const value = action[field];
    if (kind === "scale") {
      if (typeof value !== "number") throw new Error(`This is a scale question: "${field}" takes a number from 0 to 10, like ${field === "answer" ? 7 : 5}, not ${JSON.stringify(value)}.`);
      continue;
    }
    const takes = kind === "who" ? `a player's name: ${options.map((o) => o.label).join(", ")}` : `an option's key as a string: ${options.map((o) => `"${o.key}" (${o.label})`).join(", ")}`;
    if (typeof value !== "string" || !options.some((o) => o.key === value)) {
      throw new Error(`This is a ${kind} question: "${field}" takes ${takes}, not ${JSON.stringify(value)}.`);
    }
  }
}

/** Checks a game move against the running game's rules, so mistakes show up at once. */
export function gameMessage({ name, id, view }: Actor, action: Record<string, unknown>): ClientMessage {
  if (view.phase !== "playing" || !view.game) throw new Error("No game is running.");
  if (!view.game.players.includes(id)) throw new Error(`${name} is watching this game, not playing it.`);
  const parsed = GAMES[view.game.gameId].actionSchema.safeParse(withIds(action, view));
  if (!parsed.success) throw new Error(`Not a valid ${GAMES[view.game.gameId].title} move: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  if (view.game.gameId === "survey-says") checkSurveySays(view.game.view as SurveySaysView, parsed.data as Record<string, unknown>);
  return { type: "action", action: parsed.data };
}

/**
 * A drawing as the running game takes it: a whole drawing in Skip Logic, a single line in Fake Artist, a fighter in
 * parts in Doodle Champions, and in Doodle Smash a fighter with its weapon kind (`weapon blade|blaster`).
 */
export function drawAction(view: MatchView, shapes: string): Record<string, unknown> {
  const gameId = view.game?.gameId;
  if (gameId === "doodle-champions" || gameId === "doodle-smash") {
    const strokes = drawShapes(shapes, Math.random, DOODLE_LIMITS);
    if (!strokes.some((s) => (s.t ?? "body") === "body")) {
      throw new Error('A fighter needs a body: start with "part body", then its shapes, then "part legs", "part arms" or "part weapon".');
    }
    const weapon = shapesWeapon(shapes);
    if (gameId === "doodle-smash") return { type: "fighter", strokes, weapon: weapon ?? "blade" };
    if (weapon) throw new Error('"weapon blade|blaster" is for Doodle Smash; in Doodle Champions every weapon just hits.');
    return { type: "fighter", strokes };
  }
  const strokes = drawShapes(shapes);
  if (view.game?.gameId !== "fake-artist") return { type: "draw", strokes };
  if (strokes.length !== 1 || strokes[0]!.k === "fill") {
    throw new Error("Fake Artist takes exactly one line per turn: one line, poly, curve, arc or outline, and no fill.");
  }
  return { type: "line", points: strokes[0]!.p };
}

/** Splits an item into the messages it sends, checking all of them first so a mistake sends nothing. */
export function partsOf(actor: Actor, item: ActItem): Part[] {
  const moves = (["action", "draw", "ready"] as const).filter((key) => item[key] !== undefined && item[key] !== false);
  if (moves.length > 1) throw new Error(`Give at most one of action, draw or ready per item, not ${moves.join(" and ")}.`);
  const parts: Part[] = [];
  if (item.action?.type === "draw" || item.action?.type === "line" || item.action?.type === "fighter") {
    throw new Error(`Drawings go in the item's own "draw" field as shapes, not in "action": {"bot":"${actor.name}","draw":"line 100 100 400 400"}.`);
  }
  if (item.action?.type === "input") {
    throw new Error("Doodle Smash's fight is live: the autopilot steers every bot's fighter, so give it table talk instead.");
  }
  if (item.action) {
    parts.push({ message: gameMessage(actor, item.action), what: `${String(item.action.type)} move`, move: true, delay: between(2, 7) });
  } else if (item.draw !== undefined) {
    // Fake Artist turns are short, so a single line goes out quickly.
    const quick = actor.view.game?.gameId === "fake-artist";
    parts.push({ message: gameMessage(actor, drawAction(actor.view, item.draw)), what: "drawing", move: true, delay: quick ? between(0.5, 2) : between(3, 9) });
  } else if (item.ready) {
    parts.push({ message: { type: "ready" }, what: "ready", move: false, delay: between(1, 3) });
  }
  if (item.say !== undefined) {
    const text = item.say.trim();
    if (!text || text.length > CHAT_MAX) throw new Error(`Chat messages are 1 to ${CHAT_MAX} characters.`);
    parts.push({ message: { type: "chat", text }, what: "chat", move: false, delay: between(1, 2.5) + Math.min(6, text.length / 15) });
  }
  if (item.react !== undefined) {
    if (!REACTIONS.includes(item.react as Reaction)) throw new Error(`Reactions are ${REACTIONS.join(", ")}.`);
    const target = item.target ? actor.view.members.find((m) => m.name.toLowerCase() === item.target!.trim().toLowerCase())?.id : undefined;
    if (item.target && !target) throw new Error(`Nobody called "${item.target}" is in the room.`);
    parts.push({ message: { type: "react", emoji: item.react as Reaction, target }, what: `${item.react} reaction`, move: false, delay: between(0.3, 1.8) });
  }
  if (!parts.length) throw new Error("Give one of action, draw, say, react or ready.");
  return parts;
}
