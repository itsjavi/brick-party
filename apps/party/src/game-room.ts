import { packContent } from "@brick/content";
import { aiAvailable, aiEnabled, buildContent, judgeChains, judgeGuess, nameFighters } from "@brick/content/ai";
import {
  GAMES,
  avatarSchema,
  clientMessageSchema,
  createMatch,
  createTestMatch,
  guessMatches,
  judgeChainsByKeywords,
  nextDeadline,
  nicknameSchema,
  randomSeed,
  reduceMatch,
  roomSummary,
  viewMatch,
  type JudgeChainsResult,
  type JudgeGuessResult,
  type MatchEffect,
  type NameFightersResult,
  type MatchEvent,
  type GameId,
  type MatchState,
  type PlayerInfo,
  type ServerMessage,
} from "@brick/game";
import {
  createDb,
  markUsed,
  recentAiTexts,
  recentlyUsedIds,
  saveMatch,
  storeGeneratedCards,
  touchRoom,
  type Db,
} from "@brick/db";
import { jwtVerify } from "jose";
import { Server, getServerByName, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { aiConfig, type ServerEnv } from "./env";
import { MessageBucket, Throttle } from "./limits";
import { BROADCAST_INTERVAL_MS, LiveTicker, broadcastInterval, liveRate } from "./live";

const CHAT_INTERVAL_MS = 700;
const REACTIONS_PER_SECOND = 5;
/** Every message a connection sends, on average and in a burst (DECISION-11). */
const MESSAGES_PER_SECOND = 8;
const MESSAGE_BURST = 20;
/** Fits the most detailed Skip Logic drawing (about 70 KB of JSON). Longer messages are dropped. */
const MAX_MESSAGE_CHARS = 100_000;
/** A connection that keeps flooding after this many dropped messages is closed. */
const MAX_DROPPED = 200;
/**
 * The room's state is saved at most this often, so a burst of chat and clicks costs one write.
 * Durable Object writes are capped per day on the free plan. Phase changes save at once.
 */
const SAVE_INTERVAL_MS = 2_000;
/** How often a live fight (Doodle Smash) is saved: a restart mid-fight loses at most this much of it. */
const LIVE_SAVE_INTERVAL_MS = 10_000;
/** A room nobody has been in for this long forgets everything (DECISION-13). */
const IDLE_WIPE_MS = 24 * 60 * 60_000;
/** Re-report to the registry at least this often so a quiet lobby doesn't expire from the list. */
const SUMMARY_REFRESH_MS = 4 * 60_000;

interface ConnState {
  playerId: string;
}

/**
 * One Durable Object per room code. It owns the match state; all game rules live in the pure
 * `reduceMatch` from @brick/game, and this class only does I/O: sockets, storage, alarms and the
 * async effects the match asks for (content and judging from Claude, saving results to D1).
 */
export class GameRoom extends Server<ServerEnv> {
  match!: MatchState;
  lastChat = new Map<string, number>();
  recentReactions = new Map<string, number[]>();
  /** Message rate per connection id. */
  flows = new Map<string, { bucket: MessageBucket; dropped: number }>();
  lastSummary = "";
  lastSummaryAt = 0;
  #db: Db | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** The alarm as last set, so an unchanged deadline isn't written again. */
  #alarm: { at: number; idle: boolean } | null = null;
  /**
   * Sends everyone their view, at most every `BROADCAST_INTERVAL_MS` while the room stays in the same moment, so a
   * real-time game (Paint Grab's brushes send several batches a second each) costs a few broadcasts a second rather
   * than one per message; a live fight goes out a little faster (live.ts). A new phase, deadline or pause still goes
   * out at once, and chat never waits: it's sent on its own.
   */
  #views = new Throttle(BROADCAST_INTERVAL_MS, () => this.broadcastViews());
  /** The room's moment at the last update, so a new one goes out at once. */
  #moment = "";
  /** A live game's ticks, from memory (DECISION-19). */
  #live = new LiveTicker(() => this.dispatch({ type: "tick", now: Date.now() }));

  /** One Prisma client per room, created on first use. */
  get db(): Db {
    return (this.#db ??= createDb(this.env.DB));
  }

  async onStart() {
    this.match = (await this.ctx.storage.get<MatchState>("state")) ?? this.freshMatch();
    this.match.pace = Number(this.env.GAME_PACE) || 1;
    // Test rooms never call Claude (TASK-39).
    this.match.ai = !this.match.test && aiEnabled(aiConfig(this.env));
  }

  private freshMatch(): MatchState {
    return createMatch(this.name, randomSeed(), Number(this.env.GAME_PACE) || 1, aiEnabled(aiConfig(this.env)));
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const player = await this.verify(new URL(ctx.request.url).searchParams.get("token"));
    if (!player) {
      connection.close(4001, "unauthorized");
      return;
    }
    connection.setState({ playerId: player.id } satisfies ConnState);
    this.send(connection, { type: "chat_history", messages: this.match.chat });
    this.dispatch({ type: "join", player, now: Date.now() });
    // Playing here keeps the code its creator's (DECISION-13); the query writes at most hourly.
    this.ctx.waitUntil(touchRoom(this.db, this.name).catch((error) => console.warn("couldn't touch the room", error)));
  }

  /** "Create a room" starts the room over for its creator (DECISION-13), unless someone is in it. */
  async restart(): Promise<"restarted" | "busy"> {
    if (this.anyoneHere()) return "busy";
    await this.wipe();
    return "restarted";
  }

  /** Makes this an empty "Test it" room for `gameId` (TASK-39), unless someone is in it. */
  async startTest(gameId: GameId): Promise<"ready" | "busy"> {
    if (this.anyoneHere()) return "busy";
    await this.wipe();
    this.match = createTestMatch(this.name, randomSeed(), gameId, Number(this.env.GAME_PACE) || 1);
    this.flush();
    this.scheduleAlarm();
    return "ready";
  }

  onMessage(connection: Connection, raw: WSMessage) {
    const playerId = (connection.state as ConnState | null)?.playerId;
    if (!playerId) return;
    const now = Date.now();
    if (!this.allowMessage(connection, now)) return;
    if ((typeof raw === "string" ? raw.length : raw.byteLength) > MAX_MESSAGE_CHARS) return;
    let data: unknown;
    try {
      data = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const parsed = clientMessageSchema.safeParse(data);
    if (!parsed.success) return;
    const msg = parsed.data;

    switch (msg.type) {
      case "chat":
        if (now - (this.lastChat.get(playerId) ?? 0) < CHAT_INTERVAL_MS) return;
        this.lastChat.set(playerId, now);
        this.dispatch({ type: "chat", playerId, text: msg.text, now });
        return;
      case "react": {
        const recent = (this.recentReactions.get(playerId) ?? []).filter((t) => now - t < 1000);
        if (recent.length >= REACTIONS_PER_SECOND) return;
        this.recentReactions.set(playerId, [...recent, now]);
        this.broadcastMessage({ type: "reaction", from: playerId, emoji: msg.emoji, target: msg.target });
        return;
      }
      case "settings":
        this.dispatch({ type: "settings", playerId, settings: msg.settings, now });
        return;
      case "kick":
        this.dispatch({ type: "kick", playerId, targetId: msg.playerId, now });
        return;
      case "action":
        this.dispatch({ type: "action", playerId, action: msg.action, now });
        return;
      default:
        this.dispatch({ type: msg.type, playerId, now });
    }
  }

  onClose(connection: Connection) {
    this.flows.delete(connection.id);
    const playerId = (connection.state as ConnState | null)?.playerId;
    if (!playerId) return;
    const stillHere = [...this.getConnections<ConnState>()].some(
      (c) => c.id !== connection.id && c.state?.playerId === playerId,
    );
    if (!stillHere) this.dispatch({ type: "disconnect", playerId, now: Date.now() });
    if (!this.anyoneHere(connection.id)) this.flush();
    this.syncLive(connection.id);
  }

  async onAlarm() {
    this.#alarm = null;
    if (!this.anyoneHere() && nextDeadline(this.match) === null) return this.wipe();
    this.dispatch({ type: "tick", now: Date.now() });
  }

  /** Whether any socket is open, ignoring `closing` (a socket that's going away). */
  private anyoneHere(closing?: string): boolean {
    for (const connection of this.getConnections()) if (connection.id !== closing) return true;
    return false;
  }

  /** Forgets the room: state, chat and alarm. The next visitor starts fresh (DECISION-13). */
  private async wipe() {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    this.#views.cancel();
    this.#live.stop();
    this.#alarm = null;
    await this.ctx.storage.deleteAll();
    this.match = this.freshMatch();
    this.lastChat.clear();
    this.recentReactions.clear();
    this.reportSummary();
  }

  /** Drops messages from a connection sending too fast, and closes it if it keeps going. */
  private allowMessage(connection: Connection, now: number): boolean {
    let flow = this.flows.get(connection.id);
    if (!flow) {
      flow = { bucket: new MessageBucket(MESSAGES_PER_SECOND, MESSAGE_BURST, now), dropped: 0 };
      this.flows.set(connection.id, flow);
    }
    if (flow.bucket.take(now)) return true;
    flow.dropped += 1;
    if (flow.dropped === MAX_DROPPED) connection.close(4008, "too many messages");
    return false;
  }

  private async verify(token: string | null): Promise<PlayerInfo | null> {
    if (!token || !this.env.GAME_JWT_SECRET) return null;
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.env.GAME_JWT_SECRET), {
        algorithms: ["HS256"],
      });
      if (payload.room !== this.name || typeof payload.sub !== "string") return null;
      const name = nicknameSchema.safeParse(payload.name);
      const avatar = avatarSchema.safeParse(payload.avatar);
      if (!name.success || !avatar.success) return null;
      return { id: payload.sub, name: name.data, avatar: avatar.data };
    } catch {
      return null;
    }
  }

  private dispatch(event: MatchEvent) {
    const phase = this.match.phase;
    const step = reduceMatch(this.match, event);
    this.match = step.state;
    if (this.match.phase === phase) this.saveSoon();
    else this.flush();
    this.scheduleAlarm();
    for (const effect of step.effects) this.runEffect(effect);
    // Saving and the alarm above never wait for the update: only the broadcast is coalesced.
    this.syncLive();
    const moment = this.moment();
    this.#views.request(moment !== this.#moment);
    this.#moment = moment;
    this.reportSummary();
  }

  /** Starts, changes or stops the live ticks and the update rate to match the room. `closing` is a socket going away. */
  private syncLive(closing?: string) {
    const rate = liveRate(this.match, this.anyoneHere(closing));
    this.#live.set(rate);
    this.#views.every(broadcastInterval(rate));
  }

  /** Where the room is: its phase, game deadline and pause. When this changes, screens hear at once. */
  private moment(): string {
    const m = this.match;
    const game = m.game ? GAMES[m.game.gameId].deadline(m.game.state) : null;
    return [m.phase, m.index, m.phaseEndsAt, game, m.pausedAt].join("|");
  }

  private saveSoon() {
    // A live fight changes every tick and carries every drawing, so it's saved less often; phase changes still save at once.
    this.#saveTimer ??= setTimeout(() => this.flush(), liveRate(this.match, true) ? LIVE_SAVE_INTERVAL_MS : SAVE_INTERVAL_MS);
  }

  private flush() {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    void this.ctx.storage.put("state", this.match);
  }

  /** Wakes the room at its next deadline or, once nobody's here, to wipe it after a day. */
  private scheduleAlarm() {
    const deadline = nextDeadline(this.match);
    const now = Date.now();
    const next =
      deadline !== null
        ? { at: Math.max(deadline, now + 10), idle: false }
        : this.anyoneHere()
          ? null
          : { at: now + IDLE_WIPE_MS, idle: true };
    const current = this.#alarm;
    if (next === null ? current === null : current !== null && (next.idle ? current.idle : current.at === next.at)) return;
    this.#alarm = next;
    if (next === null) void this.ctx.storage.deleteAlarm();
    else void this.ctx.storage.setAlarm(next.at);
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }

  private broadcastMessage(message: ServerMessage) {
    this.broadcast(JSON.stringify(message));
  }

  /** Every connection gets its own view: each player only sees their own secrets. */
  private broadcastViews() {
    const now = Date.now();
    const views = new Map<string, string>();
    for (const connection of this.getConnections<ConnState>()) {
      const playerId = connection.state?.playerId;
      if (!playerId) continue;
      let json = views.get(playerId);
      if (!json) {
        json = JSON.stringify({ type: "state", view: viewMatch(this.match, playerId, now) } satisfies ServerMessage);
        views.set(playerId, json);
      }
      connection.send(json);
    }
  }

  private runEffect(effect: MatchEffect) {
    switch (effect.kind) {
      case "chat":
        this.broadcastMessage({ type: "chat", message: effect.message });
        return;
      case "kick":
        for (const connection of this.getConnections<ConnState>()) {
          if (connection.state?.playerId !== effect.playerId) continue;
          this.send(connection, { type: "kicked" });
          connection.close(4003, "kicked");
        }
        return;
      case "full":
        for (const connection of this.getConnections<ConnState>()) {
          if (connection.state?.playerId === effect.playerId) connection.close(4009, "room full");
        }
        return;
      case "load_content":
        this.later(effect.id, () => this.loadContent(effect));
        return;
      case "judge_guess":
        this.later(effect.id, async (): Promise<JudgeGuessResult> => {
          const config = aiConfig(this.env, this.db);
          if (this.match.ai && (await aiAvailable(config))) {
            try {
              return await judgeGuess(config, effect.input);
            } catch (error) {
              console.warn("judge failed, using fuzzy match", error instanceof Error ? error.message : error);
            }
          }
          return { correct: guessMatches(effect.input.realQuestion, effect.input.guess) };
        });
        return;
      case "judge_chains":
        this.later(effect.id, async (): Promise<JudgeChainsResult> => {
          const config = aiConfig(this.env, this.db);
          if (this.match.ai && (await aiAvailable(config))) {
            try {
              return await judgeChains(config, effect.input);
            } catch (error) {
              console.warn("chain judge failed, using fuzzy match", error instanceof Error ? error.message : error);
            }
          }
          return judgeChainsByKeywords(effect.input);
        });
        return;
      case "name_fighters":
        // Without Claude the game keeps its stock names and commentary, so `null` is a fine answer.
        this.later(effect.id, async (): Promise<NameFightersResult | null> => {
          const config = aiConfig(this.env, this.db);
          if (this.match.ai && (await aiAvailable(config))) {
            try {
              return await nameFighters(config, effect.input);
            } catch (error) {
              console.warn("naming fighters failed, using stock names", error instanceof Error ? error.message : error);
            }
          }
          return null;
        });
        return;
      case "save_match":
        this.later(effect.id, async () => {
          try {
            return { matchId: await saveMatch(this.db, effect.report) };
          } catch (error) {
            console.warn("saving the match failed", error);
            return null;
          }
        });
        return;
    }
  }

  /** Runs async work and feeds its result back into the match as an `effect_result`. */
  private later(effectId: string, work: () => Promise<unknown>) {
    this.ctx.waitUntil(
      work().then((result) => this.dispatch({ type: "effect_result", effectId, result, now: Date.now() })),
    );
  }

  /**
   * Content from Claude mixed with the packs, steered away from recent AI cards and recently
   * served pack cards. Anything that fails falls back to the packs.
   */
  private async loadContent(effect: Extract<MatchEffect, { kind: "load_content" }>) {
    const { index } = effect;
    const gameId = effect.request.gameId;
    const seed = (this.match.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    // Test rooms play the packs and leave the database alone.
    if (this.match.test) return { index, content: packContent(effect.request, seed) };
    const [avoidTexts, recentIds] = await Promise.all([
      recentAiTexts(this.db, gameId).catch(() => [] as string[]),
      recentlyUsedIds(this.db, gameId).catch(() => [] as string[]),
    ]);
    const request = { ...effect.request, avoid: [...effect.request.avoid, ...recentIds] };

    let content: unknown;
    try {
      ({ content } = await buildContent(aiConfig(this.env, this.db), request, seed, { avoidTexts }));
    } catch (error) {
      console.warn("building content failed, using packs", error instanceof Error ? error.message : error);
    }
    if (!GAMES[gameId].contentSchema.safeParse(content).success) content = packContent(request, seed);

    try {
      const items = Object.values(content as Record<string, { id: string }[]>).flat();
      await storeGeneratedCards(this.db, gameId, request.spice, items);
      await markUsed(this.db, gameId, GAMES[gameId].contentIds(content));
    } catch (error) {
      console.warn("couldn't record served cards", error);
    }
    return { index, content };
  }

  /** Keeps the home page's open-rooms list current. Rooms drop off it once nobody holds a seat. */
  private reportSummary() {
    const summary = roomSummary(this.match);
    const key = JSON.stringify(summary);
    const now = Date.now();
    if (key === this.lastSummary && (summary === null || now - this.lastSummaryAt < SUMMARY_REFRESH_MS)) return;
    this.lastSummary = key;
    this.lastSummaryAt = now;
    const body = summary ? { ...summary, updatedAt: now } : { code: this.name, remove: true };
    this.ctx.waitUntil(
      getServerByName(this.env.LobbyRegistry, "main")
        .then((registry) =>
          registry.fetch(
            new Request("https://registry/parties/lobby-registry/main", { method: "POST", body: JSON.stringify(body) }),
          ),
        )
        .catch((error) => console.warn("registry update failed", error)),
    );
  }
}
