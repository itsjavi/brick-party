import { z } from "zod";
import { computeAwards, type Award, type GameRecord } from "./awards";
import { situationKey, todoFor } from "./bots";
import type { GameEffect, PhaseClock } from "./engine";
import type { RoomSummary } from "./protocol";
import { createRng } from "./rng";
import { GAMES } from "./games";
import {
  GAME_IDS,
  SPICE_LEVELS,
  gameIdSchema,
  type Avatar,
  type ContentRequest,
  type GameId,
  type PlayerId,
  type PlayerInfo,
} from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** People in a room at once; the first 12 play, the rest watch. */
export const MAX_MEMBERS = 20;
/** Members kept in a room's state, counting those who left mid-match. */
const MAX_MEMBER_RECORDS = 40;
/** Endless mode goes to the Retro Report after this many games (about four hours). */
export const ENDLESS_MAX_GAMES = 40;
/** At most 100 messages of at most 280 characters: under 100 KB per room even in emoji. */
export const CHAT_HISTORY = 100;
const LOADING_TIMEOUT_MS = 30_000;
const INTERMISSION_SECONDS = 12;
/** How long the "How to play" screen stays up before a game, unless everyone is ready sooner. */
const INTRO_SECONDS = 20;
/** How long a disconnected player keeps their seat. Short in the lobby, where it's usually a refresh. */
const AWAY_GRACE_LOBBY_MS = 20_000;
const AWAY_GRACE_GAME_MS = 90_000;
/** A pause longer than this resumes by itself, so a forgotten pause doesn't hold a room open (TASK-40). */
export const MAX_PAUSE_MS = 10 * 60_000;
/** Phases with a countdown the host can pause. */
const PAUSABLE: MatchPhase[] = ["intro", "playing", "intermission"];

export const PLAYLIST_PRESETS = ["quick", "full", "endless", "custom"] as const;
export type PlaylistPreset = (typeof PLAYLIST_PRESETS)[number];

export const PRESET_GAMES: Record<"quick" | "full", GameId[]> = {
  quick: ["worst-feedback", "bot-or-not", "survey-says"],
  full: ["worst-feedback", "survey-says", "bot-or-not", "skip-logic", "brick-brawl", "fake-artist"],
};
export const ENDLESS_ROTATION: GameId[] = [
  "worst-feedback",
  "bot-or-not",
  "survey-says",
  "skip-logic",
  "fake-artist",
  "brick-brawl",
  "in-order",
  "doodle-champions",
  "paint-grab",
  "hue-clue",
  "doodle-smash",
  "make-it-worse",
];

export const matchSettingsSchema = z.object({
  preset: z.enum(PLAYLIST_PRESETS),
  custom: z.array(gameIdSchema).max(12),
  spice: z.enum(SPICE_LEVELS),
  /** A shuffled lineup that replaces the "quick" or "full" preset's games (`shuffleLineup`); left out, the preset's own. */
  lineup: z.array(gameIdSchema).min(1).max(12).nullable().optional(),
});
export type MatchSettings = z.infer<typeof matchSettingsSchema>;

export const DEFAULT_SETTINGS: MatchSettings = { preset: "quick", custom: [...GAME_IDS], spice: "mild" };

/** The bots a "Test it" room seats next to its one person (TASK-39). Ids can't clash with real players' ids. */
export const TEST_BOTS: PlayerInfo[] = [
  { id: "bot:bolt", name: "Bolt", avatar: { color: "coral", hat: "cap", face: "glasses", shape: "round" } },
  {
    id: "bot:pixel",
    name: "Pixel",
    avatar: { color: "grape", hat: "headset", face: "cyclops", shape: "jelly" },
  },
  {
    id: "bot:widget",
    name: "Widget",
    avatar: { color: "lime", hat: "beanie", face: "mustache", shape: "slim" },
  },
];

export interface Member extends PlayerInfo {
  status: "online" | "away" | "left";
  awaySince: number | null;
}

export interface ChatMessage {
  id: string;
  /** `null` for system messages. */
  playerId: PlayerId | null;
  text: string;
  at: number;
}

export interface MatchReport {
  code: string;
  startedAt: number;
  endedAt: number;
  players: { id: PlayerId; name: string; avatar: Avatar; total: number; rank: number }[];
  games: { gameId: GameId; points: Record<PlayerId, number>; stats: GameRecord["stats"] }[];
  awards: Award[];
}

export type MatchPhase = "lobby" | "loading" | "intro" | "playing" | "intermission" | "report";

export interface MatchState {
  code: string;
  phase: MatchPhase;
  phaseEndsAt: number | null;
  hostId: PlayerId | null;
  members: Member[];
  kicked: PlayerId[];
  settings: MatchSettings;
  playlist: GameId[];
  index: number;
  content: Record<number, unknown>;
  pendingContent: number[];
  usedContentIds: string[];
  game: { gameId: GameId; players: PlayerId[]; state: unknown } | null;
  /** Players who pressed "Got it" on the current game's rules. */
  introReady: PlayerId[];
  history: GameRecord[];
  totals: Record<PlayerId, number>;
  chat: ChatMessage[];
  startedAt: number | null;
  report: MatchReport | null;
  matchId: string | null;
  seed: number;
  seq: number;
  pace: number;
  /** Whether Claude is switched on for content and judging (the server sets it from its env). */
  ai: boolean;
  /** Set in a "Test it" room: one game for one person, with server-side bots in the other seats. */
  test?: { gameId: GameId } | null;
  /** Members the server plays for. */
  bots?: PlayerId[];
  /** When each bot makes its next move, keyed by bot, moment and move; -1 once made. */
  botPlan?: Record<string, number>;
  /** When the host paused the countdown (real time), or `null` while it runs. */
  pausedAt?: number | null;
  /**
   * Real time spent paused so far. Everything inside the match (games, deadlines, `phaseEndsAt`) runs on a match
   * clock, real time minus this, so a pause holds every countdown without the games knowing about it.
   */
  pausedTotal?: number;
}

export type MatchEvent =
  | { type: "join"; player: PlayerInfo; now: number }
  | { type: "disconnect"; playerId: PlayerId; now: number }
  | { type: "chat"; playerId: PlayerId; text: string; now: number }
  | { type: "settings"; playerId: PlayerId; settings: MatchSettings; now: number }
  | { type: "start"; playerId: PlayerId; now: number }
  | { type: "next"; playerId: PlayerId; now: number }
  | { type: "end"; playerId: PlayerId; now: number }
  | { type: "again"; playerId: PlayerId; now: number }
  | { type: "ready"; playerId: PlayerId; now: number }
  | { type: "kick"; playerId: PlayerId; targetId: PlayerId; now: number }
  | { type: "pause"; playerId: PlayerId; now: number }
  | { type: "resume"; playerId: PlayerId; now: number }
  | { type: "extend"; playerId: PlayerId; now: number }
  | { type: "action"; playerId: PlayerId; action: unknown; now: number }
  | { type: "tick"; now: number }
  | { type: "effect_result"; effectId: string; result: unknown; now: number };

export type MatchEffect =
  | { id: string; kind: "load_content"; index: number; request: ContentRequest }
  /** Games' own async work (AI judging), with ids prefixed by the playlist index. */
  | GameEffect
  | { id: string; kind: "save_match"; report: MatchReport }
  | { id: string; kind: "chat"; message: ChatMessage }
  | { id: string; kind: "kick"; playerId: PlayerId }
  /** Turns away a player who isn't a member, because the room is full. */
  | { id: string; kind: "full"; playerId: PlayerId };

export interface MatchStep {
  state: MatchState;
  effects: MatchEffect[];
}

export interface MatchView {
  code: string;
  phase: MatchPhase;
  phaseEndsAt: number | null;
  serverNow: number;
  you: PlayerId | null;
  hostId: PlayerId | null;
  members: (PlayerInfo & { status: Member["status"]; score: number; playing: boolean })[];
  settings: MatchSettings;
  playlist: GameId[];
  index: number;
  game: { gameId: GameId; players: PlayerId[]; view: unknown; deadline: number | null } | null;
  introReady: PlayerId[];
  lastGame: GameRecord | null;
  report: MatchReport | null;
  matchId: string | null;
  /** Whether Claude writes content and judges; the screens only mention Claude when it does. */
  ai: boolean;
  /** The game a "Test it" room plays, or `null` in a normal room. */
  test: GameId | null;
  /** Members played by the server. */
  bots: PlayerId[];
  /** Whether the host has paused the countdown. `serverNow` stands still while it is. */
  paused: boolean;
  /** What the host's "+N s" button adds to the current timer, or `null` when there's none to stretch. */
  extendMs: number | null;
  /** Changes when a pause ends, so clients can tell the match clock jumped and resync at once. */
  clockEpoch: number;
  /**
   * Whether the running game is live right now (DECISION-19): its view then changes many times a second, so screens
   * can draw it outside React and redraw the rest less often.
   */
  live: boolean;
}

export function createMatch(code: string, seed: number, pace = 1, ai = false): MatchState {
  return {
    code,
    phase: "lobby",
    phaseEndsAt: null,
    hostId: null,
    members: [],
    kicked: [],
    settings: DEFAULT_SETTINGS,
    playlist: [],
    index: 0,
    content: {},
    pendingContent: [],
    usedContentIds: [],
    game: null,
    introReady: [],
    history: [],
    totals: {},
    chat: [],
    startedAt: null,
    report: null,
    matchId: null,
    seed,
    seq: 0,
    pace,
    ai,
    test: null,
    bots: [],
    botPlan: {},
    pausedAt: null,
    pausedTotal: 0,
  };
}

/**
 * A "Test it" room for `gameId` (TASK-39): bots already seated, and the game starts as soon as its person joins.
 * Claude stays off, so test rooms cost nothing beyond the room itself.
 */
export function createTestMatch(code: string, seed: number, gameId: GameId, pace = 1): MatchState {
  const s = createMatch(code, seed, pace, false);
  s.test = { gameId };
  s.settings = { ...DEFAULT_SETTINGS, preset: "custom", custom: [gameId] };
  s.members = TEST_BOTS.map((bot) => ({ ...bot, status: "online", awaySince: null }));
  s.bots = TEST_BOTS.map((bot) => bot.id);
  return s;
}

const isBot = (s: MatchState, id: PlayerId) => !!s.bots?.includes(id);

/** The match clock at real time `now`: it stops while paused, and leaves out time spent paused. */
const matchClock = (s: MatchState, now: number) => (s.pausedAt ?? now) - (s.pausedTotal ?? 0);

/** While paused, these wait: moves, "Got it", skipping, and the clock. Chat, joining and leaving go on. */
const HELD_WHILE_PAUSED = new Set<MatchEvent["type"]>(["action", "ready", "next", "tick", "start"]);

function resume(st: Stepper, now: number, why: string) {
  const s = st.s;
  if (s.pausedAt === null || s.pausedAt === undefined) return;
  s.pausedTotal = (s.pausedTotal ?? 0) + Math.max(0, now - s.pausedAt);
  s.pausedAt = null;
  if (why) st.say(why, matchClock(s, now));
}
const introMs = (s: MatchState) => Math.max(1000, INTRO_SECONDS * 1000 * s.pace);
const intermissionMs = (s: MatchState) => Math.max(1000, INTERMISSION_SECONDS * 1000 * s.pace);

/**
 * How much the host's "+N s" button adds right now: the current screen's usual length, or `null` when there's no
 * timer to stretch. Live games run on their own clock, so they can't be stretched.
 */
export function extendMs(s: MatchState): number | null {
  if (s.phase === "intro") return introMs(s);
  if (s.phase === "intermission") return intermissionMs(s);
  if (s.phase !== "playing" || !s.game) return null;
  const def = GAMES[s.game.gameId];
  if (def.live?.(s.game.state) || def.isOver(s.game.state)) return null;
  return (s.game.state as PhaseClock).phaseMs || null;
}

/** Whether anyone but bots is still in the room. */
const hasPerson = (s: MatchState) => s.members.some((m) => !isBot(s, m.id) && m.status !== "left");

/** Builds a step on a private copy of the state so reducers can mutate freely. */
class Stepper {
  effects: MatchEffect[] = [];
  constructor(public s: MatchState) {}

  id(prefix: string) {
    this.s.seq += 1;
    return `${prefix}${this.s.seq}`;
  }

  say(text: string, now: number, playerId: PlayerId | null = null) {
    const message: ChatMessage = { id: this.id("c"), playerId, text, at: now };
    this.s.chat = [...this.s.chat, message].slice(-CHAT_HISTORY);
    this.effects.push({ id: message.id, kind: "chat", message });
  }

  member(id: PlayerId) {
    return this.s.members.find((m) => m.id === id);
  }

  present() {
    return this.s.members.filter((m) => m.status !== "left");
  }

  isHost(id: PlayerId) {
    return this.s.hostId === id;
  }
}

const gameSeed = (s: MatchState, index: number) => (s.seed + Math.imul(index + 1, 2654435761)) >>> 0;

/** The games a lineup setting plays, in order. */
export function resolvePlaylist(settings: MatchSettings): GameId[] {
  if (settings.preset === "custom")
    return settings.custom.length ? [...settings.custom] : [...PRESET_GAMES.quick];
  if (settings.preset === "endless") return [...ENDLESS_ROTATION];
  return settings.lineup?.length ? [...settings.lineup] : [...PRESET_GAMES[settings.preset]];
}

/** Minutes each timed preset aims for when shuffled. */
const PRESET_MINUTES = { quick: 30, full: 60 } as const;

/**
 * A random lineup for the "quick" or "full" preset: different games in a random order, adding up to about its
 * minutes (a few under at most, never more than a few over).
 */
export function shuffleLineup(preset: "quick" | "full", random: () => number = Math.random): GameId[] {
  const target = PRESET_MINUTES[preset];
  const pool = [...GAME_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked: GameId[] = [];
  let minutes = 0;
  for (const id of pool) {
    if (minutes >= target - 4) break;
    if (minutes + GAMES[id].minutes > target + 3) continue;
    picked.push(id);
    minutes += GAMES[id].minutes;
  }
  return picked;
}

function requestContent(st: Stepper, index: number) {
  const s = st.s;
  if (index >= s.playlist.length && s.settings.preset === "endless" && index < ENDLESS_MAX_GAMES) {
    s.playlist.push(ENDLESS_ROTATION[index % ENDLESS_ROTATION.length]!);
  }
  const gameId = s.playlist[index];
  if (!gameId || s.content[index] !== undefined || s.pendingContent.includes(index)) return;
  const players = Math.min(MAX_PLAYERS, st.present().length);
  const request = GAMES[gameId].contentRequest(players, s.settings.spice, s.usedContentIds);
  s.pendingContent.push(index);
  st.effects.push({ id: st.id("load"), kind: "load_content", index, request });
}

function startGame(st: Stepper, now: number) {
  const s = st.s;
  const gameId = s.playlist[s.index];
  if (!gameId) return goReport(st, now);
  const content = s.content[s.index];
  if (content === undefined) {
    s.phase = "loading";
    s.phaseEndsAt = now + LOADING_TIMEOUT_MS;
    requestContent(st, s.index);
    return;
  }
  const def = GAMES[gameId];
  if (st.present().length < def.minPlayers) {
    st.say(`Not enough players for ${def.title}, skipping it.`, now);
    return advance(st, now);
  }
  s.phase = "intro";
  s.phaseEndsAt = now + introMs(s);
  s.introReady = [];
}

/** Ends the rules screen and starts the game, with whoever is in the room now. */
function beginGame(st: Stepper, now: number) {
  const s = st.s;
  const gameId = s.playlist[s.index];
  const content = s.content[s.index];
  if (!gameId || content === undefined) return startGame(st, now);
  const def = GAMES[gameId];
  const players = st.present().slice(0, MAX_PLAYERS);
  if (players.length < def.minPlayers) {
    st.say(`Not enough players for ${def.title}, skipping it.`, now);
    return advance(st, now);
  }
  s.introReady = [];
  const step = def.init({
    players: players.map(({ id, name, avatar }) => ({ id, name, avatar })),
    content,
    spice: s.settings.spice,
    seed: gameSeed(s, s.index),
    now,
    pace: s.pace,
  });
  s.game = { gameId, players: players.map((p) => p.id), state: step.state };
  s.phase = "playing";
  s.phaseEndsAt = null;
  delete s.content[s.index];
  pushGameEffects(st, step.effects);
  requestContent(st, s.index + 1);
}

function pushGameEffects(st: Stepper, effects: GameEffect[] | undefined) {
  for (const e of effects ?? []) st.effects.push({ ...e, id: `g${st.s.index}:${e.id}` });
}

function finishGame(st: Stepper, now: number) {
  const s = st.s;
  if (!s.game) return;
  const def = GAMES[s.game.gameId];
  const record: GameRecord = {
    gameId: s.game.gameId,
    players: s.game.players,
    points: def.scores(s.game.state),
    stats: def.stats(s.game.state),
  };
  s.history.push(record);
  for (const [id, pts] of Object.entries(record.points)) s.totals[id] = (s.totals[id] ?? 0) + pts;
  s.game = null;
  if (!hasMoreGames(s)) return goReport(st, now);
  s.phase = "intermission";
  s.phaseEndsAt = now + intermissionMs(s);
}

/** Whether a game follows the current one: the playlist goes on, or endless mode is under its cap. */
function hasMoreGames(s: MatchState): boolean {
  return s.settings.preset === "endless" ? s.index + 1 < ENDLESS_MAX_GAMES : s.index + 1 < s.playlist.length;
}

function advance(st: Stepper, now: number) {
  const s = st.s;
  const more = hasMoreGames(s);
  s.index += 1;
  if (!more) return goReport(st, now);
  requestContent(st, s.index);
  startGame(st, now);
}

export function standings(s: MatchState): PlayerId[] {
  const ids = new Set([...Object.keys(s.totals), ...s.history.flatMap((h) => h.players)]);
  const order = s.members.map((m) => m.id);
  return [...ids].sort(
    (a, b) => (s.totals[b] ?? 0) - (s.totals[a] ?? 0) || order.indexOf(a) - order.indexOf(b),
  );
}

function goReport(st: Stepper, now: number) {
  const s = st.s;
  s.phase = "report";
  s.phaseEndsAt = null;
  s.game = null;
  const ranked = standings(s);
  const players = ranked.flatMap((id) => {
    const m = st.member(id);
    if (!m) return [];
    const total = s.totals[id] ?? 0;
    const rank = 1 + ranked.filter((other) => (s.totals[other] ?? 0) > total).length;
    return [{ id, name: m.name, avatar: m.avatar, total, rank }];
  });
  s.report = {
    code: s.code,
    startedAt: s.startedAt ?? now,
    endedAt: now,
    players,
    games: s.history.map((h) => ({ gameId: h.gameId, points: h.points, stats: h.stats })),
    awards: computeAwards(s.history, ranked, s.totals),
  };
  // Test games stay out of the Hall of Fame and get no shareable report.
  if (s.history.length > 0 && !s.test)
    st.effects.push({ id: st.id("save"), kind: "save_match", report: s.report });
}

/** Forwards an event to the running game and handles the game ending. */
function stepGame(st: Stepper, event: Parameters<(typeof GAMES)[GameId]["reduce"]>[1]) {
  const s = st.s;
  if (!s.game) return;
  const def = GAMES[s.game.gameId];
  const step = def.reduce(s.game.state, event);
  s.game.state = step.state;
  pushGameEffects(st, step.effects);
  if (def.isOver(step.state)) finishGame(st, event.now);
}

function leave(st: Stepper, member: Member, now: number) {
  const s = st.s;
  member.status = "left";
  member.awaySince = null;
  if (s.phase === "lobby") s.members = s.members.filter((m) => m.id !== member.id);
  if (s.game?.players.includes(member.id)) stepGame(st, { type: "player_left", playerId: member.id, now });
  if (s.hostId === member.id) {
    const people = st.present().filter((m) => !isBot(s, m.id));
    const next = people.find((m) => m.status === "online") ?? people[0];
    s.hostId = next?.id ?? null;
    if (next) st.say(`${next.name} is the host now.`, now);
  }
}

/** Drops people away for longer than the grace, judged on real time `real`; `now` is the match clock. */
function expireAway(st: Stepper, real: number, now: number) {
  const grace = st.s.phase === "lobby" ? AWAY_GRACE_LOBBY_MS : AWAY_GRACE_GAME_MS;
  for (const m of [...st.s.members]) {
    if (m.status === "away" && m.awaySince !== null && real - m.awaySince >= grace) {
      st.say(`${m.name} left.`, now);
      leave(st, m, now);
    }
  }
}

export function reduceMatch(state: MatchState, realEvent: MatchEvent): MatchStep {
  const live = liveStep(state, realEvent);
  if (live) return live;
  const st = new Stepper(structuredClone(state));
  const s = st.s;
  s.introReady ??= [];
  s.pausedAt ??= null;
  const host = "playerId" in realEvent && st.isHost(realEvent.playerId);
  const real = realEvent.now;

  if (realEvent.type === "pause") {
    if (host && s.pausedAt === null && PAUSABLE.includes(s.phase)) {
      st.say(`${st.member(realEvent.playerId)?.name ?? "The host"} paused the game.`, matchClock(s, real));
      s.pausedAt = real;
    }
    return { state: s, effects: st.effects };
  }
  if (s.pausedAt !== null) {
    if (realEvent.type === "resume" && host)
      resume(st, real, `${st.member(realEvent.playerId)?.name ?? "The host"} resumed the game.`);
    else if (realEvent.type === "tick" && real >= s.pausedAt + MAX_PAUSE_MS)
      resume(st, real, "The pause ran out, so the game goes on.");
    else if (realEvent.type === "end" && host) resume(st, real, "");
    else if (HELD_WHILE_PAUSED.has(realEvent.type)) {
      // People who left still time out, so someone else can take over as host and resume.
      if (realEvent.type === "tick") expireAway(st, real, matchClock(s, real));
      return { state: s, effects: st.effects };
    }
  }
  if (realEvent.type === "resume") return { state: s, effects: st.effects };
  // From here on, everything runs on the match clock.
  const event = { ...realEvent, now: matchClock(s, real) } as MatchEvent;

  switch (event.type) {
    case "join": {
      if (s.kicked.includes(event.player.id)) {
        st.effects.push({ id: st.id("k"), kind: "kick", playerId: event.player.id });
        break;
      }
      const existing = st.member(event.player.id);
      if (existing) {
        const returning = existing.status === "left";
        Object.assign(existing, event.player, { status: "online", awaySince: null });
        if (returning) st.say(`${existing.name} is back.`, event.now);
      } else if (st.present().length >= MAX_MEMBERS || s.members.length >= MAX_MEMBER_RECORDS) {
        st.effects.push({ id: st.id("f"), kind: "full", playerId: event.player.id });
        break;
      } else {
        s.members.push({ ...event.player, status: "online", awaySince: null });
        st.say(`${event.player.name} joined.`, event.now);
      }
      if (!s.hostId || st.member(s.hostId)?.status === "left") s.hostId = event.player.id;
      // A test room skips the lobby: its person goes straight to the rules.
      if (s.test && s.phase === "lobby" && s.hostId === event.player.id) startMatch(st, event.now);
      break;
    }
    case "disconnect": {
      const m = st.member(event.playerId);
      if (m && m.status === "online") {
        m.status = "away";
        // Real time, unlike the rest of the match, so people time out even while paused.
        m.awaySince = real;
      }
      break;
    }
    case "chat": {
      const m = st.member(event.playerId);
      const text = event.text.trim().slice(0, 280);
      if (m && m.status !== "left" && text) st.say(text, event.now, m.id);
      break;
    }
    case "settings":
      if (host && s.phase === "lobby") s.settings = event.settings;
      break;
    case "start":
      if (host && s.phase === "lobby") startMatch(st, event.now);
      break;
    case "ready": {
      if (s.phase !== "intro" || s.introReady.includes(event.playerId)) break;
      if (st.member(event.playerId)?.status !== "online") break;
      s.introReady.push(event.playerId);
      const online = st.present().filter((m) => m.status === "online");
      if (online.every((m) => s.introReady.includes(m.id))) beginGame(st, event.now);
      break;
    }
    case "next":
      if (!host) break;
      if (s.phase === "intro") beginGame(st, event.now);
      else if (s.phase === "playing") stepGame(st, { type: "skip", now: event.now });
      else if (s.phase === "intermission") advance(st, event.now);
      break;
    case "extend": {
      const ms = extendMs(s);
      if (!host || !ms) break;
      if (s.phase === "playing") (s.game!.state as PhaseClock).phaseEndsAt += ms;
      else s.phaseEndsAt = (s.phaseEndsAt ?? event.now) + ms;
      st.say(`${st.member(event.playerId)?.name ?? "The host"} added ${Math.round(ms / 1000)} seconds.`, event.now);
      break;
    }
    case "end":
      if (!host || s.phase === "lobby" || s.phase === "report") break;
      if (s.game) finishGame(st, event.now);
      // finishGame may already have produced the report.
      if (st.s.phase !== "report") goReport(st, event.now);
      break;
    case "again":
      if (!host || s.phase !== "report") break;
      s.phase = "lobby";
      s.members = s.members.filter((m) => m.status !== "left");
      s.history = [];
      s.totals = {};
      s.report = null;
      s.matchId = null;
      s.playlist = [];
      s.index = 0;
      s.content = {};
      s.pendingContent = [];
      if (s.test) startMatch(st, event.now);
      break;
    case "kick": {
      const target = st.member(event.targetId);
      if (!host || !target || target.id === event.playerId) break;
      s.kicked.push(target.id);
      st.say(`${target.name} was removed by the host.`, event.now);
      leave(st, target, event.now);
      st.effects.push({ id: st.id("k"), kind: "kick", playerId: target.id });
      break;
    }
    case "action": {
      if (s.phase !== "playing" || !s.game || !s.game.players.includes(event.playerId)) break;
      const parsed = GAMES[s.game.gameId].actionSchema.safeParse(event.action);
      if (!parsed.success) break;
      stepGame(st, { type: "action", playerId: event.playerId, action: parsed.data, now: event.now });
      break;
    }
    case "tick": {
      expireAway(st, real, event.now);
      if (s.phase === "loading" && s.phaseEndsAt !== null && event.now >= s.phaseEndsAt) {
        const gameId = s.playlist[s.index];
        st.say(`Couldn't load ${gameId ? GAMES[gameId].title : "the next game"}, skipping it.`, event.now);
        s.pendingContent = s.pendingContent.filter((i) => i !== s.index);
        advance(st, event.now);
      } else if (s.phase === "intro" && s.phaseEndsAt !== null && event.now >= s.phaseEndsAt) {
        beginGame(st, event.now);
      } else if (s.phase === "playing" && s.game) {
        const def = GAMES[s.game.gameId];
        const deadline = def.deadline(s.game.state);
        if (def.live?.(s.game.state)) {
          liveBots(st, event.now);
          if (s.game) stepGame(st, { type: "tick", now: event.now });
        } else if (deadline !== null && event.now >= deadline) stepGame(st, { type: "tick", now: event.now });
      } else if (s.phase === "intermission" && s.phaseEndsAt !== null && event.now >= s.phaseEndsAt) {
        advance(st, event.now);
      }
      break;
    }
    case "effect_result": {
      const load = /^load\d+$/.test(event.effectId)
        ? (event.result as { index: number; content: unknown })
        : null;
      if (load) {
        if (!s.pendingContent.includes(load.index)) break;
        s.pendingContent = s.pendingContent.filter((i) => i !== load.index);
        const gameId = s.playlist[load.index];
        if (!gameId) break;
        s.content[load.index] = load.content;
        s.usedContentIds.push(...GAMES[gameId].contentIds(load.content));
        if (s.phase === "loading" && load.index === s.index) startGame(st, event.now);
      } else if (event.effectId.startsWith("save")) {
        const matchId = (event.result as { matchId?: string } | null)?.matchId;
        if (matchId) s.matchId = matchId;
      } else if (event.effectId.startsWith(`g${s.index}:`) && s.game) {
        stepGame(st, {
          type: "effect_result",
          effectId: event.effectId.slice(`g${s.index}:`.length),
          result: event.result,
          now: event.now,
        });
      }
      break;
    }
  }
  if (s.bots?.length && s.pausedAt === null) runBots(st, event.now);
  return { state: s, effects: st.effects };
}

function startMatch(st: Stepper, now: number) {
  const s = st.s;
  if (st.present().filter((m) => m.status === "online").length < MIN_PLAYERS) {
    st.say(`You need at least ${MIN_PLAYERS} players to start.`, now);
    return;
  }
  s.playlist = resolvePlaylist(s.settings);
  s.index = 0;
  s.content = {};
  s.pendingContent = [];
  s.history = [];
  s.totals = {};
  s.report = null;
  s.matchId = null;
  s.startedAt = now;
  requestContent(st, 0);
  requestContent(st, 1);
  startGame(st, now);
}

/**
 * The rate the room ticks a live game at (DECISION-19), or `null` when there's none to tick: no live game running, or
 * the match is paused. The room also stops ticking when nobody is connected.
 */
export function liveTickMs(s: MatchState): number | null {
  if (s.phase !== "playing" || !s.game || (s.pausedAt ?? null) !== null) return null;
  return GAMES[s.game.gameId].live?.(s.game.state)?.tickMs ?? null;
}

/** Live games' bots: each makes its move for this tick, while a person is in the room. */
function liveBots(st: Stepper, now: number) {
  const s = st.s;
  const def = s.game ? GAMES[s.game.gameId] : null;
  if (!def?.botInput || !s.bots?.length || !hasPerson(s)) return;
  for (const id of s.bots) {
    const game = s.game;
    if (!game || !game.players.includes(id)) continue;
    const action = def.botInput(game.state, id, now);
    if (action) stepGame(st, { type: "action", playerId: id, action, now });
  }
}

/**
 * The quick way through a live game's ticks and moves, which come many times a second: it copies only the game's
 * state (which the game itself copies sparingly) instead of the whole match. Anything more than a plain step (a
 * deadline, someone timing out, the game ending or asking for work) returns `null` and takes the full path.
 */
function liveStep(state: MatchState, event: MatchEvent): MatchStep | null {
  if (event.type !== "tick" && event.type !== "action") return null;
  const game = state.game;
  if (!game || state.phase !== "playing" || (state.pausedAt ?? null) !== null) return null;
  const def = GAMES[game.gameId];
  if (!def.live?.(game.state)) return null;
  const now = matchClock(state, event.now);
  let gs = game.state;
  if (event.type === "action") {
    if (!game.players.includes(event.playerId)) return { state, effects: [] };
    const parsed = def.actionSchema.safeParse(event.action);
    if (!parsed.success) return { state, effects: [] };
    const step = def.reduce(gs, { type: "action", playerId: event.playerId, action: parsed.data, now });
    if (step.effects?.length || def.isOver(step.state)) return null;
    gs = step.state;
  } else {
    const away = state.members.some((m) => m.status === "away" && m.awaySince !== null && event.now - m.awaySince >= AWAY_GRACE_GAME_MS);
    const deadline = def.deadline(gs);
    if (away || (deadline !== null && now >= deadline)) return null;
    if (def.botInput && state.bots?.length && hasPerson(state)) {
      for (const id of state.bots) {
        if (!game.players.includes(id)) continue;
        const action = def.botInput(gs, id, now);
        if (!action) continue;
        const step = def.reduce(gs, { type: "action", playerId: id, action, now });
        if (step.effects?.length) return null;
        gs = step.state;
      }
    }
    const step = def.reduce(gs, { type: "tick", now });
    if (step.effects?.length || def.isOver(step.state)) return null;
    gs = step.state;
  }
  return { state: { ...state, game: { ...game, state: gs } }, effects: [] };
}

/** How long a test bot takes over a move, before `pace`: quick, so the person rarely waits on bots. */
const BOT_THINK_MS = [1500, 6000] as const;

/**
 * Plays the server's bots: they press "Got it" on the rules at once, and make each move a few seconds after it's
 * needed, using the same simple moves the CLI's autopilot falls back on. Bots only play while a person is in the room.
 */
function runBots(st: Stepper, now: number) {
  const s = st.s;
  const bots = s.bots ?? [];
  s.botPlan ??= {};
  if (!hasPerson(s)) return;
  if (s.phase === "intro") {
    for (const id of bots) if (!s.introReady.includes(id)) s.introReady.push(id);
  }
  const rng = createRng((s.seed ^ Math.imul(s.seq + 1, 0x9e3779b1) ^ now) >>> 0);
  // Each move changes the game, so look again after every one. Bounded in case a move doesn't count.
  for (let moves = 0; moves < bots.length * 4; moves++) {
    if (s.phase !== "playing" || !s.game) break;
    const game = s.game;
    let moved = false;
    for (const id of bots) {
      if (!game.players.includes(id)) continue;
      const view = viewAt(s, id, now);
      const todo = todoFor(view, id);
      if (!todo) continue;
      const key = `${id}|${situationKey(view)}|${todo.hint}`;
      if (s.botPlan[key] === undefined) {
        const think = Math.max(
          200,
          (BOT_THINK_MS[0] + rng.next() * (BOT_THINK_MS[1] - BOT_THINK_MS[0])) * s.pace,
        );
        // A timed move (In Order) waits for its moment; other moves go once the bot has thought.
        s.botPlan[key] = Math.max(now, todo.timed ? todo.autoAt : Math.min(now + think, todo.autoAt));
      }
      const due = s.botPlan[key]!;
      if (due < 0 || now < due) continue;
      s.botPlan[key] = -1;
      const parsed = GAMES[game.gameId].actionSchema.safeParse(todo.fallback(rng.next));
      if (!parsed.success) continue;
      stepGame(st, { type: "action", playerId: id, action: parsed.data, now });
      moved = true;
      break;
    }
    if (!moved) break;
  }
  // Forget plans for moments that are over, so the plan stays small. A steady move (Paint Grab's strokes) gets a new
  // hint each time, so only its current one is worth keeping.
  const current = bots.map((id) => {
    const view = viewAt(s, id, now);
    const prefix = `${id}|${situationKey(view)}|`;
    const todo = todoFor(view, id);
    return { prefix, only: todo?.steady ? `${prefix}${todo.hint}` : null };
  });
  for (const key of Object.keys(s.botPlan)) {
    if (!current.some(({ prefix, only }) => (only === null ? key.startsWith(prefix) : key === only)))
      delete s.botPlan[key];
  }
}

/**
 * When the room should next tick, in real time: the earliest of phase, game, bot and away-grace deadlines. While
 * paused, only when the pause runs out or someone times out.
 */
export function nextDeadline(s: MatchState): number | null {
  const paused = s.pausedAt !== null && s.pausedAt !== undefined;
  // Match-clock deadlines, which wait while paused.
  const clock: number[] = [];
  if (!paused) {
    if (s.phaseEndsAt !== null) clock.push(s.phaseEndsAt);
    if (s.game) {
      const d = GAMES[s.game.gameId].deadline(s.game.state);
      if (d !== null) clock.push(d);
    }
    if (hasPerson(s)) for (const due of Object.values(s.botPlan ?? {})) if (due >= 0) clock.push(due);
  }
  // Real-time deadlines: the end of a pause, and people timing out.
  const real = clock.map((t) => t + (s.pausedTotal ?? 0));
  if (paused) real.push(s.pausedAt! + MAX_PAUSE_MS);
  const grace = s.phase === "lobby" ? AWAY_GRACE_LOBBY_MS : AWAY_GRACE_GAME_MS;
  for (const m of s.members) if (m.status === "away" && m.awaySince !== null) real.push(m.awaySince + grace);
  return real.length ? Math.min(...real) : null;
}

/**
 * What the room tells the public open-rooms list, or null to come off it. It counts everyone still holding a seat, so a
 * room its people stepped away from stays listed until their seats are let go. Test rooms are never listed.
 */
export function roomSummary(s: MatchState): Omit<RoomSummary, "updatedAt"> | null {
  if (s.test) return null;
  const seated = s.members.filter((m) => m.status !== "left");
  if (!seated.length) return null;
  return {
    code: s.code,
    players: seated.length,
    away: seated.filter((m) => m.status === "away").length,
    phase: s.phase,
    gameId: s.game?.gameId ?? null,
  };
}

/** What `viewer` sees at real time `now`. Its times are on the match clock, `serverNow` included. */
export function viewMatch(s: MatchState, viewer: PlayerId | null, now: number): MatchView {
  return viewAt(s, viewer, matchClock(s, now));
}

function viewAt(s: MatchState, viewer: PlayerId | null, now: number): MatchView {
  const game = s.game;
  const def = game ? GAMES[game.gameId] : null;
  const participant = viewer !== null && !!game?.players.includes(viewer);
  return {
    code: s.code,
    phase: s.phase,
    phaseEndsAt: s.phaseEndsAt,
    serverNow: now,
    you: viewer,
    hostId: s.hostId,
    members: s.members
      .filter((m) => m.status !== "left")
      .map(({ id, name, avatar, status }) => ({
        id,
        name,
        avatar,
        status,
        score: s.totals[id] ?? 0,
        playing: !!game?.players.includes(id),
      })),
    settings: s.settings,
    playlist: s.playlist,
    index: s.index,
    game:
      game && def
        ? {
            gameId: game.gameId,
            players: game.players,
            view: def.view(game.state, participant ? viewer : null),
            deadline: def.deadline(game.state),
          }
        : null,
    introReady: s.introReady ?? [],
    lastGame: s.history.at(-1) ?? null,
    report: s.report,
    matchId: s.matchId,
    ai: s.ai ?? false,
    test: s.test?.gameId ?? null,
    bots: s.bots ?? [],
    paused: s.pausedAt !== null && s.pausedAt !== undefined,
    extendMs: extendMs(s),
    clockEpoch: s.pausedTotal ?? 0,
    live: s.phase === "playing" && !!game && !!def?.live?.(game.state),
  };
}
