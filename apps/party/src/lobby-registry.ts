import type { RoomSummary } from "@brick/game";
import { Server, type Connection } from "partyserver";
import type { ServerEnv } from "./env";

/** Rooms that haven't reported in this long are dropped from the list. */
const STALE_MS = 10 * 60_000;
/** The home page shows at most this many rooms (DECISION-11). */
export const MAX_LISTED_ROOMS = 50;
/** Rooms kept beyond the listed ones, so the list refills when a listed room closes. */
const MAX_TRACKED_ROOMS = 100;
/** The list is saved at most this often; reports in between share one write. */
const SAVE_INTERVAL_MS = 5_000;

/** Only the public fields, so nothing else a room sends (or sent before) reaches the home page. */
const summary = ({ code, players, away, phase, gameId }: RoomSummary, updatedAt: number): RoomSummary => ({
  code,
  players,
  // Rooms saved before away counts existed.
  away: away ?? 0,
  phase,
  gameId,
  updatedAt,
});

/** What connected home pages receive whenever the list changes. */
export interface RoomsMessage {
  type: "rooms";
  rooms: RoomSummary[];
}

/** One instance ("main") keeps the list of open rooms for the home page. Rooms report through a stub. */
export class LobbyRegistry extends Server<ServerEnv> {
  rooms = new Map<string, RoomSummary>();
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  async onStart() {
    for (const room of (await this.ctx.storage.get<RoomSummary[]>("rooms")) ?? []) this.rooms.set(room.code, summary(room, room.updatedAt));
  }

  onConnect(connection: Connection) {
    connection.send(JSON.stringify({ type: "rooms", rooms: this.list() } satisfies RoomsMessage));
  }

  async onRequest(request: Request): Promise<Response> {
    if (request.method === "GET") return Response.json(this.list());
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = (await request.json()) as RoomSummary | { code: string; remove: true };
    if ("remove" in body) this.rooms.delete(body.code);
    else {
      this.rooms.delete(body.code);
      this.rooms.set(body.code, summary(body, Date.now()));
      // A Map keeps insertion order, so the first entries are the longest without a report.
      for (const old of this.rooms.keys()) {
        if (this.rooms.size <= MAX_TRACKED_ROOMS) break;
        this.rooms.delete(old);
      }
    }
    this.saveSoon();
    this.broadcast(JSON.stringify({ type: "rooms", rooms: this.list() } satisfies RoomsMessage));
    return new Response("ok");
  }

  /** Open lobbies first, then games in progress, newest first, at most `MAX_LISTED_ROOMS`. */
  list(): RoomSummary[] {
    const now = Date.now();
    for (const [code, room] of this.rooms) if (now - room.updatedAt > STALE_MS) this.rooms.delete(code);
    return [...this.rooms.values()]
      .sort((a, b) => Number(b.phase === "lobby") - Number(a.phase === "lobby") || b.updatedAt - a.updatedAt)
      .slice(0, MAX_LISTED_ROOMS);
  }

  private saveSoon() {
    this.#saveTimer ??= setTimeout(() => {
      this.#saveTimer = null;
      void this.ctx.storage.put("rooms", [...this.rooms.values()]);
    }, SAVE_INTERVAL_MS);
  }
}
