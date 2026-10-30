import {
  COLOR_NAMES,
  FAKE_ARTIST_SIZE,
  SmashInputQueue,
  cellLabel,
  fightSight,
  smashBot,
  type ChatMessage,
  type DoodleChampionsView,
  type DoodleSmashView,
  type FakeArtistView,
  type HueClueView,
  type MatchView,
  type Reaction,
  type SkipLogicView,
  type SmashFighterView,
} from "@brick/game";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { between, gameMessage, partsOf, type ActItem, type Part } from "./act";
import { AutopilotMemory } from "./autopilot";
import { Bot, PlayerStore, type BotListener } from "./bot";
import { EventFeed, needsState } from "./feed";
import { botLines, namesOf, roomLines, situationKey, situationLine, todoFor } from "./moves";
import { PERSONAS } from "./personas";
import { hueHtml, lookHtml, Renderer, type HueMark } from "./render";

export interface DaemonOptions {
  base: string;
  code: string;
  bots: number;
  port: number;
  /** Where the event log, cookies and renders go (`.local/bots`). */
  dir: string;
}

const MAX_DELAY_S = 60;
/** How long `next` waits by default, kept under a shell tool's usual two-minute limit. */
const NEXT_WAIT_S = 90;
/** After the first new event, how long `next` waits for the rest of its batch. */
const NEXT_GATHER_MS = 400;
/** At most one line per this long for reactions aimed at bots. */
const REACTION_EVENT_GAP_MS = 3_000;
/** How often the autopilot looks at the room: often enough for Paint Grab's strokes and Doodle Smash's fights. */
const AUTOPILOT_MS = 250;

/** The running Doodle Smash game in a view, if any. */
const smashOf = (view: MatchView | null): DoodleSmashView | null =>
  view?.phase === "playing" && view.game?.gameId === "doodle-smash" ? (view.game.view as DoodleSmashView) : null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the bots in one room and lets a driver (Claude, through the CLI) play them: an event line for
 * every moment worth a decision, `next` to wait for one, `state` to see, `act` to move, `look` for
 * drawings, and an autopilot for whatever the driver doesn't get to in time.
 */
export class Daemon implements BotListener {
  readonly bots: Bot[];
  #chat: ChatMessage[] = [];
  #chatIds = new Set<string>();
  #chatShown = 0;
  #lastKey = "";
  #situationTimer: ReturnType<typeof setTimeout> | null = null;
  /** Game moves queued per bot; the autopilot leaves those bots alone. */
  #queued = new Map<string, number>();
  #autopilot = new AutopilotMemory();
  #lastReactionEvent = 0;
  #renderer = new Renderer();
  #looks = 0;
  #server: Server | null = null;
  #events: string;
  #feed = new EventFeed();
  /** Each bot's Doodle Smash keys, and the fight they're for. */
  #fights = new Map<string, { queue: SmashInputQueue; seed: number }>();
  /** Doodle Smash fight events already told, and the drawings (they only come now and then during the fight). */
  #smashSeen = -1;
  #smashFighters: { version: number; fighters: SmashFighterView[] } | null = null;
  #smashCast: { version: number; cast: SmashFighterView["spec"][] } | null = null;

  constructor(private opts: DaemonOptions) {
    mkdirSync(opts.dir, { recursive: true });
    this.#events = join(opts.dir, "events.log");
    writeFileSync(this.#events, "");
    const store = new PlayerStore(join(opts.dir, "players.json"));
    this.bots = PERSONAS.slice(0, opts.bots).map((persona) => new Bot(persona, opts.base, opts.code, store, this));
  }

  async start() {
    this.#server = createServer((req, res) => {
      void this.handle(req.method ?? "GET", new URL(req.url ?? "/", "http://localhost"), req)
        .then((text) => res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(text))
        .catch((error: unknown) => res.writeHead(400).end(error instanceof Error ? error.message : String(error)));
    });
    await new Promise<void>((resolve, reject) => this.#server!.once("error", reject).listen(this.opts.port, "127.0.0.1", resolve));
    writeFileSync(join(this.opts.dir, "daemon.json"), JSON.stringify({ port: this.opts.port, code: this.opts.code, pid: process.pid }));
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void this.stop());

    for (const bot of this.bots) {
      await bot.join();
      this.emit(`[bot] ${bot.name} joined ${this.opts.code}`);
      await sleep(between(300, 1200));
    }
    setInterval(() => this.autopilot(), AUTOPILOT_MS);
    this.emit(`[ready] ${this.bots.length} bots are in room ${this.opts.code}`);
  }

  async stop() {
    for (const bot of this.bots) bot.close();
    await this.#renderer.close().catch(() => {});
    this.#server?.close();
    rmSync(join(this.opts.dir, "daemon.json"), { force: true });
    this.emit("[stopped] the bots left");
    // Long enough for a waiting `next` to hear it.
    await sleep(300);
    process.exit(0);
  }

  private async handle(method: string, url: URL, req: AsyncIterable<Buffer>): Promise<string> {
    if (url.pathname === "/ping") return `ok ${this.opts.code}`;
    if (url.pathname === "/state") return this.stateText();
    if (url.pathname === "/next") return this.next(Number(url.searchParams.get("wait") || NEXT_WAIT_S));
    if (url.pathname === "/look") return this.look(url.searchParams.get("bot") ?? "");
    if (method === "POST" && url.pathname === "/act") {
      let body = "";
      for await (const chunk of req) body += chunk;
      return this.act(JSON.parse(body) as ActItem | ActItem[]);
    }
    if (method === "POST" && url.pathname === "/stop") {
      setTimeout(() => void this.stop(), 100);
      return "Stopping.";
    }
    throw new Error(`No such command: ${method} ${url.pathname}`);
  }

  private emit(line: string) {
    console.log(line);
    appendFileSync(this.#events, `${line}\n`);
    this.#feed.push(line);
  }

  private isBot = (id: string | null | undefined) => !!id && this.bots.some((b) => b.id === id);

  /** The bot whose view best shows the room: one playing the current game, if any. */
  private lead(): Bot | null {
    const live = this.bots.filter((b) => b.view && b.id && !b.gone);
    return live.find((b) => b.view!.game?.players.includes(b.id!)) ?? live[0] ?? null;
  }

  // BotListener

  state(bot: Bot) {
    // Every update, so even a quick "Play again" passes through the lobby here.
    if (bot.view) this.#autopilot.see(bot.view);
    if (bot === this.lead()) this.smashNews(bot);
    // Once a quarter second at most: a live fight sends many updates a second, and the room's moment can't wait for
    // them to stop.
    this.#situationTimer ??= setTimeout(() => {
      this.#situationTimer = null;
      this.checkSituation();
    }, 250);
  }

  /** Doodle Smash: keeps the drawings when an update has them, and tells the driver about knockouts. */
  private smashNews(bot: Bot) {
    const v = smashOf(bot.view);
    if (!v) return;
    if (v.withDrawings) this.#smashFighters = { version: v.drawingsVersion, fighters: v.fighters };
    if (v.fighters.length) this.#smashCast = { version: v.drawingsVersion, cast: v.fighters.map((f) => f.spec) };
    const fight = v.fight;
    if (!fight || v.phase !== "fight") return;
    if (fight.tick < 5) this.#smashSeen = -1;
    const name = namesOf(bot.view!);
    for (const e of fight.events) {
      if (e.n <= this.#smashSeen) continue;
      this.#smashSeen = e.n;
      if (e.k !== "ko") continue;
      const victim = name(v.order[e.b]);
      const lives = e.p === "out" ? "out of lives" : "loses a life";
      this.emit(e.a >= 0 ? `[ko] ${name(v.order[e.a])} sent ${victim} flying off the stage (${victim} ${lives})` : `[ko] ${victim} fell off the stage on their own (${lives})`);
    }
  }

  chat(_bot: Bot, message: ChatMessage, history: boolean) {
    if (this.#chatIds.has(message.id)) return;
    this.#chatIds.add(message.id);
    this.#chat.push(message);
    if (history) this.#chatShown = this.#chat.length;
    if (history || this.isBot(message.playerId)) return;
    const botNames = this.bots.map((b) => b.name);
    if (message.playerId === null) {
      if (!botNames.some((name) => message.text.startsWith(name))) this.emit(`[room] ${message.text}`);
      return;
    }
    const view = this.lead()?.view;
    const mentions = botNames.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(message.text));
    this.emit(`[chat] ${view ? namesOf(view)(message.playerId) : "?"}: ${message.text}${mentions.length ? ` (mentions ${mentions.join(", ")})` : ""}`);
  }

  reaction(bot: Bot, from: string, emoji: Reaction, target?: string) {
    // Every bot hears every reaction; take them from one bot, and only humans' reactions aimed at a bot.
    if (bot !== this.bots.find((b) => !b.gone) || this.isBot(from) || !this.isBot(target)) return;
    if (Date.now() - this.#lastReactionEvent < REACTION_EVENT_GAP_MS || !bot.view) return;
    this.#lastReactionEvent = Date.now();
    const name = namesOf(bot.view);
    this.emit(`[react] ${name(from)} → ${name(target)}: ${emoji}`);
  }

  gone(bot: Bot, why: string) {
    this.emit(`[bot] ${bot.name} is out: ${why}`);
  }

  private checkSituation() {
    const lead = this.lead();
    if (!lead?.view) return;
    const key = situationKey(lead.view);
    if (key === this.#lastKey) return;
    this.#lastKey = key;
    const toAct = this.bots.filter((b) => b.view && b.id && todoFor(b.view, b.id)).map((b) => b.name);
    const line = situationLine(lead.view, lead.now());
    // A turn none of the bots has to play (the human guessing, say) is a wait for them.
    if (!toAct.length) return this.emit(line.replace(/^\[turn\]/, "[wait]"));
    this.emit(`${line} · to act: ${toAct.join(", ")}`);
  }

  // Commands

  private stateText(): string {
    const lead = this.lead();
    if (!lead?.view) return "The bots are still joining.";
    const view = lead.view;
    const name = namesOf(view);
    const lines = roomLines(view, this.isBot, lead.now());
    const fresh = this.#chat.slice(this.#chatShown).slice(-20);
    this.#chatShown = this.#chat.length;
    lines.push(fresh.length ? "New chat:" : "New chat: none");
    for (const m of fresh) lines.push(m.playerId ? `  ${name(m.playerId)}: ${m.text}` : `  · ${m.text}`);
    for (const bot of this.bots) {
      const role = bot.persona.style.split(".")[0];
      if (bot.gone || !bot.view || !bot.id) {
        lines.push(`${bot.name} (${role}): ${bot.gone ?? "joining"}`);
        continue;
      }
      lines.push(`${bot.name} (${role}):`, ...botLines(bot.view, bot.id, bot.now()).map((l) => `  ${l}`));
    }
    return lines.join("\n");
  }

  /** The events since the last `next`, waiting for one if there are none, with the state when a bot might act. */
  private async next(waitS: number): Promise<string> {
    const wait = Number.isFinite(waitS) ? Math.max(1, Math.min(600, waitS)) : NEXT_WAIT_S;
    const lines = await this.#feed.next(wait * 1000, NEXT_GATHER_MS);
    if (!lines.length) return `[quiet] nothing happened in ${wait}s`;
    return needsState(lines) ? `${lines.join("\n")}\n\n${this.stateText()}` : lines.join("\n");
  }

  private act(input: ActItem | ActItem[]): string {
    const items = Array.isArray(input) ? input : [input];
    return items
      .map((item) => {
        try {
          return this.queue(item);
        } catch (error) {
          return `error (${item.bot ?? "?"}): ${error instanceof Error ? error.message : String(error)}`;
        }
      })
      .join("\n");
  }

  private findBot(name: string): Bot {
    const bot = this.bots.find((b) => b.name.toLowerCase() === name.trim().toLowerCase());
    if (!bot) throw new Error(`No bot called "${name}". Bots: ${this.bots.map((b) => b.name).join(", ")}.`);
    if (bot.gone) throw new Error(`${bot.name} is out (${bot.gone}).`);
    if (!bot.view || !bot.id) throw new Error(`${bot.name} hasn't joined yet.`);
    return bot;
  }

  /** Queues each part of an item on its own clock: a chat line takes typing time, a reaction is quick. */
  private queue(item: ActItem): string {
    const bot = this.findBot(item.bot ?? "");
    const parts = partsOf({ name: bot.name, id: bot.id!, view: bot.view! }, item);
    return `${bot.name}: ${parts.map((part) => this.schedule(bot, part, item.delay)).join(", ")}`;
  }

  private schedule(bot: Bot, { message, what, move, delay: natural }: Part, override: number | undefined): string {
    const view = bot.view!;
    let delay = override !== undefined ? Math.max(0, Math.min(MAX_DELAY_S, override)) : natural;
    const todo = todoFor(view, bot.id!);
    if (move && todo) delay = Math.max(0, Math.min(delay, (todo.endsAt - bot.now()) / 1000 - 1.5));
    const key = situationKey(view);
    if (move) this.#queued.set(bot.name, (this.#queued.get(bot.name) ?? 0) + 1);
    const send = () => {
      // The server holds moves while paused, so a move waits for the resume.
      if (move && bot.view?.paused && !bot.gone) return void setTimeout(send, 1000);
      if (move) this.#queued.set(bot.name, (this.#queued.get(bot.name) ?? 1) - 1);
      if (move && (!bot.view || situationKey(bot.view) !== key)) {
        this.emit(`[late] ${bot.name}'s ${what} came after the phase ended`);
        return;
      }
      if (!bot.send(message)) this.emit(`[late] ${bot.name} was offline; the ${what} wasn't sent`);
    };
    setTimeout(send, delay * 1000);
    return `${what} in ${delay.toFixed(1)}s`;
  }

  private async look(name: string): Promise<string> {
    const bot = this.findBot(name);
    const view = bot.view!;
    const label = namesOf(view);
    const v = view.phase === "playing" && view.game?.gameId === "skip-logic" ? (view.game.view as SkipLogicView) : null;
    const previous = v?.task && !v.task.done ? v.task.previous : null;
    let entries;
    const fake = view.phase === "playing" && view.game?.gameId === "fake-artist" ? (view.game.view as FakeArtistView) : null;
    const doodle = view.phase === "playing" && view.game?.gameId === "doodle-champions" ? (view.game.view as DoodleChampionsView) : null;
    const hue = view.phase === "playing" && view.game?.gameId === "hue-clue" ? (view.game.view as HueClueView) : null;
    const smash = smashOf(view);
    if (smash) {
      const drawing = (strokes: NonNullable<SmashFighterView["strokes"]>, text: string) => ({ entry: { kind: "drawing" as const, authorId: "", strokes, timedOut: false }, label: text });
      const kept = this.#smashFighters?.version === smash.drawingsVersion ? this.#smashFighters.fighters : [];
      const fighters = (smash.withDrawings ? smash.fighters : kept).filter((f) => f.strokes);
      if (fighters.length) {
        entries = fighters.map((f) => drawing(f.strokes!, `${f.name} (${label(f.id)}) · ${f.spec.weapon === "fists" ? "fists" : f.weapon}`));
      } else if (smash.myDrawing) entries = [drawing(smash.myDrawing.strokes, `your fighter · ${smash.myDrawing.weapon}`)];
      else throw new Error(`${bot.name} has no fighters to look at yet: the drawings stay secret until the weigh-in.`);
      this.#looks += 1;
      return this.#renderer.png(lookHtml(entries), join(this.opts.dir, `look-${this.#looks}.png`));
    }
    if (hue) {
      // The board as this bot sees it: its secret colour if it gives the clue, its own pin, and everyone's at the reveal.
      const marks: HueMark[] = [];
      if (hue.target !== null) marks.push({ cell: hue.target, label: "", kind: "target" });
      if (hue.reveal) marks.push(...hue.reveal.pins.map((p) => ({ cell: p.cell, label: label(p.playerId), kind: "pin" as const })));
      else if (hue.myPin) marks.push({ cell: hue.myPin.cell, label: `${bot.name}${hue.myPin.locked ? " (locked)" : ""}`, kind: "pin" });
      const caption = [
        hue.target !== null ? `outlined: ${hue.reveal ? "the colour" : `${bot.name}'s secret colour`} ${cellLabel(hue.target)}` : null,
        hue.clue !== null ? `clue: "${hue.clue}"` : `${label(hue.giverId)} is choosing a clue`,
      ].filter(Boolean).join(" · ");
      this.#looks += 1;
      return this.#renderer.png(hueHtml(marks, caption), join(this.opts.dir, `look-${this.#looks}.png`));
    }
    if (doodle) {
      // The fighters this round's bets are on, or every fighter at the weigh-in, or the bot's own while drawing.
      const inPlay = new Set(doodle.matches.flat());
      const shown = doodle.fighters.filter((f) => !inPlay.size || inPlay.has(f.id));
      const drawing = (strokes: typeof doodle.fighters[number]["strokes"], text: string) => ({ entry: { kind: "drawing" as const, authorId: "", strokes, timedOut: false }, label: text });
      if (shown.length) {
        entries = shown.map((f) => drawing(f.strokes, `#${f.n} ${f.name} (${f.ownerId ? label(f.ownerId) : "house"})${doodle.odds[f.id] ? ` · odds x${doodle.odds[f.id]}` : ""}`));
      } else if (doodle.myDrawing) entries = [drawing(doodle.myDrawing, "your fighter")];
      else throw new Error(`${bot.name} has no fighters to look at yet: the drawings stay secret until the weigh-in.`);
    } else if (fake) {
      const strokes = fake.lines.map((l) => ({ c: fake.colors[l.playerId] ?? 0, w: FAKE_ARTIST_SIZE, p: l.p }));
      const key = Object.entries(fake.colors).map(([id, c]) => `${label(id)} ${COLOR_NAMES[c] ?? c}`);
      entries = [{ entry: { kind: "drawing" as const, authorId: "", strokes, timedOut: false }, label: key.join(", ") }];
    } else if (previous?.kind === "drawing") entries = [{ entry: previous, label: `drawing by ${label(previous.authorId)}` }];
    else if (v?.reveal) entries = v.reveal.entries.map((entry, i) => ({ entry, label: `${i}. by ${label(entry.authorId)}` }));
    else throw new Error(`${bot.name} has no drawing to look at right now.`);
    this.#looks += 1;
    return this.#renderer.png(lookHtml(entries), join(this.opts.dir, `look-${this.#looks}.png`));
  }

  // Autopilot

  private autopilot() {
    for (const bot of this.bots) {
      const view = bot.view;
      // The server holds moves while paused, so playing one now would only waste it.
      if (!view || !bot.id || bot.gone || view.paused) continue;
      this.fight(bot, view);
      if (view.phase === "intro" && !view.introReady.includes(bot.id)) {
        const due = this.#autopilot.dueAt(bot.name, view, () => Date.now() + between(2000, 9000));
        if (Date.now() >= due && this.#autopilot.once(bot.name, view, "ready")) bot.send({ type: "ready" });
      }
      const todo = todoFor(view, bot.id);
      if (!todo || (this.#queued.get(bot.name) ?? 0) > 0 || bot.now() < todo.autoAt) continue;
      if (!this.#autopilot.once(bot.name, view, todo.hint)) continue;
      const move = todo.fallback();
      if (move) this.autoMove(bot, move, todo.timed, todo.steady);
    }
  }

  /**
   * Doodle Smash's live fight: the bot's keys from the same simple fighter the server's bots use, worked out from its
   * view a few times a second and sent when they change, within the room's message limits.
   */
  private fight(bot: Bot, view: MatchView) {
    const v = smashOf(view);
    if (!v?.fight || v.phase !== "fight" || v.me < 0 || !v.fight.mine) return;
    let state = this.#fights.get(bot.name);
    if (!state || state.seed !== v.fight.seed) {
      state = { queue: new SmashInputQueue(), seed: v.fight.seed };
      this.#fights.set(bot.name, state);
    }
    const cast = v.fighters.length ? v.fighters.map((f) => f.spec) : this.#smashCast?.version === v.drawingsVersion ? this.#smashCast.cast : [];
    if (cast.length !== v.order.length) return;
    const want = smashBot(fightSight(v.fight, v.me), cast, v.me);
    state.queue.set(want.held, want.attack);
    const message = state.queue.take(Date.now());
    if (message) bot.send({ type: "action", action: message });
  }

  /**
   * Plays a move for a bot. A timed move (In Order) is the autopilot's job, not a missed deadline, and a steady one
   * (Paint Grab's brush strokes, a few a second) goes without a word.
   */
  private autoMove(bot: Bot, action: Record<string, unknown>, timed = false, steady = false) {
    try {
      bot.send(gameMessage({ name: bot.name, id: bot.id!, view: bot.view! }, action));
      if (steady) return;
      if (timed) this.emit(`[auto] ${bot.name} played a card when its moment came (expected: the autopilot times these)`);
      else if (action.type !== "ready") this.emit(`[auto] ${bot.name} ran out of time and played a fallback ${String(action.type)}`);
    } catch (error) {
      this.emit(`[auto] ${bot.name}'s fallback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
