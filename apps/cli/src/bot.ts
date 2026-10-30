import type { ChatMessage, ClientMessage, MatchView, Reaction, ServerMessage } from "@brick/game";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Persona } from "./personas";

/** Cloudflare's dummy Turnstile token: accepted when the dev server uses Turnstile's test keys. */
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
/** Close codes after which reconnecting won't help. */
const FINAL_CLOSES: Record<number, string> = { 4003: "removed by the host", 4009: "the room is full" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Cookie by server, then by bot name. */
type Cookies = Record<string, Record<string, string>>;

/** Bot cookies by server and name, so the same bricks come back between runs. */
export class PlayerStore {
  #data: Cookies;

  constructor(private file: string) {
    this.#data = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Cookies) : {};
  }

  get(base: string, name: string): string | null {
    return this.#data[base]?.[name] ?? null;
  }

  set(base: string, name: string, cookie: string) {
    (this.#data[base] ??= {})[name] = cookie;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.#data, null, 2));
  }
}

export interface BotListener {
  state(bot: Bot): void;
  chat(bot: Bot, message: ChatMessage, history: boolean): void;
  reaction(bot: Bot, from: string, emoji: Reaction, target?: string): void;
  gone(bot: Bot, why: string): void;
}

/** One bot player: a brick made through the web app, connected to a room over its WebSocket. */
export class Bot {
  id: string | null = null;
  view: MatchView | null = null;
  gone: string | null = null;
  /** Server clock minus ours, from the latest view. */
  #offset = 0;
  #ws: WebSocket | null = null;
  #cookie: string | null;
  #closing = false;

  constructor(
    readonly persona: Persona,
    private base: string,
    readonly code: string,
    private store: PlayerStore,
    private listener: BotListener,
  ) {
    this.#cookie = store.get(base, persona.name);
  }

  get name(): string {
    return this.persona.name;
  }

  /** The server's time, for comparing with deadlines in views. */
  now(): number {
    return Date.now() + this.#offset;
  }

  get online(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  async join() {
    let token = this.#cookie ? await this.roomToken() : null;
    if (!token) {
      await this.createPlayer();
      token = await this.roomToken();
    }
    if (!token) throw new Error(`${this.name} couldn't open room ${this.code}.`);
    this.connect(token);
  }

  send(message: ClientMessage): boolean {
    if (!this.online) return false;
    this.#ws!.send(JSON.stringify(message));
    return true;
  }

  close() {
    this.#closing = true;
    this.#ws?.close();
  }

  private async createPlayer() {
    const { name, avatar } = this.persona;
    const body = new URLSearchParams({
      intent: "create-player",
      nickname: name,
      color: avatar.color,
      hat: avatar.hat,
      face: avatar.face,
      shape: avatar.shape,
      "cf-turnstile-response": TURNSTILE_TEST_TOKEN,
    });
    const response = await fetch(`${this.base}/?index`, { method: "POST", body, headers: { Origin: this.base }, redirect: "manual" });
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith("bp_player="))
      ?.split(";")[0];
    if (!cookie) {
      const page = await response.text();
      const why = /Too many tries/.test(page)
        ? "too many new players from this machine, wait a minute"
        : /human/.test(page)
          ? "Turnstile is on with real keys; locally, use Cloudflare's test keys or none"
          : `HTTP ${response.status}`;
      throw new Error(`Couldn't make a brick for ${name}: ${why}.`);
    }
    this.#cookie = cookie;
    this.store.set(this.base, name, cookie);
  }

  /** A room token from the room page's data, the way the browser gets one. `null` if the cookie is stale. */
  private async roomToken(): Promise<string | null> {
    const response = await fetch(`${this.base}/r/${this.code}.data`, { headers: { Cookie: this.#cookie ?? "" }, redirect: "manual" });
    if (response.status === 429) throw new Error(`${this.name} is opening the room too often; wait a minute.`);
    const token = (await response.text()).match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0] ?? null;
    if (token) this.id = (JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { sub: string }).sub;
    return token;
  }

  private connect(token: string) {
    const ws = new WebSocket(`${this.base.replace(/^http/, "ws")}/parties/game-room/${this.code}?token=${encodeURIComponent(token)}`);
    this.#ws = ws;
    ws.addEventListener("message", (event) => this.receive(JSON.parse(String(event.data)) as ServerMessage));
    ws.addEventListener("close", (event) => {
      if (this.#ws === ws) void this.closed(event.code);
    });
  }

  private receive(message: ServerMessage) {
    switch (message.type) {
      case "state":
        this.#offset = message.view.serverNow - Date.now();
        this.view = message.view;
        this.listener.state(this);
        return;
      case "chat_history":
        for (const m of message.messages) this.listener.chat(this, m, true);
        return;
      case "chat":
        this.listener.chat(this, message.message, false);
        return;
      case "reaction":
        this.listener.reaction(this, message.from, message.emoji, message.target);
        return;
      case "kicked":
        return;
    }
  }

  /** Reconnects after dev-server reloads and expired tokens; gives up when kicked or the room is full. */
  private async closed(code: number) {
    if (this.#closing) return;
    const final = FINAL_CLOSES[code];
    if (final) {
      this.gone = final;
      this.listener.gone(this, final);
      return;
    }
    for (let attempt = 0; attempt < 30 && !this.#closing; attempt++) {
      await sleep(Math.min(5000, 1000 * (attempt + 1)));
      try {
        const token = await this.roomToken();
        if (token) return this.connect(token);
      } catch {
        // The dev server is restarting; try again.
      }
    }
    this.gone = "lost the connection";
    this.listener.gone(this, this.gone);
  }
}
