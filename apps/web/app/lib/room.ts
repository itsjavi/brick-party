import { CHAT_HISTORY, type ChatMessage, type ClientMessage, type MatchView, type Reaction, type RoomSummary, type ServerMessage } from "@brick/game";
import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { syncClock } from "./clock";
import { chromeKey, viewDelay, type Shown } from "./live-view";

export interface FloatingReaction {
  id: number;
  from: string;
  emoji: Reaction;
  target?: string;
}

export type RoomStatus = "connecting" | "open" | "reconnecting" | "kicked" | "denied" | "full";

/** Close codes after which reconnecting won't help. */
const FINAL_CLOSES: Record<number, RoomStatus> = { 4001: "denied", 4009: "full" };

let reactionSeq = 0;

/**
 * Where PartySocket connects: this page's own host, over `ws` or `wss` to match the page. Left to
 * guess, PartySocket uses `wss` for any host but `localhost` and private IPs (so `*.localhost` breaks).
 */
const partyHost = () => ({
  host: window.location.host,
  protocol: window.location.protocol === "https:" ? ("wss" as const) : ("ws" as const),
});

/**
 * Every view as it arrives, before React sees it: what a live game's screen (DECISION-19) draws from, so updates that
 * only move the fight never re-render React. The object stays the same for the room's lifetime.
 */
export interface RoomFeed {
  /** Calls `listener` with the latest view at once, if there is one, then with every view that arrives. */
  subscribe(listener: (view: MatchView) => void): () => void;
}

/** A feed of views that anyone can subscribe to. */
function createFeed() {
  const listeners = new Set<(view: MatchView) => void>();
  let latest: MatchView | null = null;
  const feed: RoomFeed = {
    subscribe(listener) {
      listeners.add(listener);
      if (latest) listener(latest);
      return () => listeners.delete(listener);
    },
  };
  const publish = (view: MatchView) => {
    latest = view;
    for (const listener of listeners) listener(view);
  };
  return { feed, publish };
}

/**
 * One live connection to a game room (served by this same Worker): the latest view, chat, and reactions. During a
 * live game, `view` is only updated a few times a second unless something around the game changes (`viewDelay`);
 * the live screen reads every update from `feed`.
 */
export function useRoom(code: string, token: string) {
  const [view, setView] = useState<MatchView | null>(null);
  const [{ feed, publish }] = useState(createFeed);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const socket = useRef<PartySocket | null>(null);

  useEffect(() => {
    const ws = new PartySocket({ ...partyHost(), party: "game-room", room: code, query: { token } });
    socket.current = ws;
    let stopped = false;
    // React's copy of the view: what it showed last, and a live update waiting for its turn.
    let shown: Shown | null = null;
    let pending: MatchView | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = (next: MatchView, key: string) => {
      shown = { key, at: performance.now() };
      pending = null;
      setView(next);
    };
    const offer = (next: MatchView) => {
      // Only a live game's views wait, so only theirs need comparing.
      const key = next.live ? chromeKey(next) : "";
      const wait = viewDelay(shown, next, key, performance.now());
      if (wait === 0) {
        if (timer) clearTimeout(timer);
        timer = null;
        show(next, key);
        return;
      }
      pending = next;
      timer ??= setTimeout(() => {
        timer = null;
        if (pending) show(pending, chromeKey(pending));
      }, wait);
    };

    ws.addEventListener("open", () => setStatus("open"));
    ws.addEventListener("close", (event) => {
      if (stopped) return;
      const final = FINAL_CLOSES[event.code];
      if (final) {
        stopped = true;
        setStatus(final);
        ws.close();
      } else {
        setStatus("reconnecting");
      }
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as ServerMessage;
      switch (msg.type) {
        case "state":
          syncClock(msg.view.serverNow, msg.view.paused, msg.view.clockEpoch);
          publish(msg.view);
          offer(msg.view);
          break;
        case "chat_history":
          setChat(msg.messages);
          break;
        case "chat":
          setChat((c) => [...c, msg.message].slice(-CHAT_HISTORY));
          break;
        case "reaction":
          reactionSeq += 1;
          setReactions((r) => [...r.slice(-24), { id: reactionSeq, from: msg.from, emoji: msg.emoji, target: msg.target }]);
          break;
        case "kicked":
          stopped = true;
          setStatus("kicked");
          ws.close();
          break;
      }
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws.close();
    };
  }, [code, token]);

  const send = useCallback((msg: ClientMessage) => {
    socket.current?.send(JSON.stringify(msg));
  }, []);

  const dismissReaction = useCallback((id: number) => {
    setReactions((r) => r.filter((x) => x.id !== id));
  }, []);

  return { view, feed, chat, reactions, status, send, dismissReaction };
}

/** Live list of open rooms from the lobby registry. */
export function useOpenRooms() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  useEffect(() => {
    const ws = new PartySocket({ ...partyHost(), party: "lobby-registry", room: "main" });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as { type: "rooms"; rooms: RoomSummary[] };
      if (msg.type === "rooms") setRooms(msg.rooms);
    });
    return () => ws.close();
  }, []);
  return rooms;
}

const LAST_ROOM_KEY = "brickparty:last-room";

/** Remembers the room this browser was last in, so the home page can offer a way back. */
export function rememberRoom(code: string) {
  try {
    localStorage.setItem(LAST_ROOM_KEY, code);
  } catch {
    // Storage can be blocked; the home page just won't offer the way back.
  }
}

/** The code of the room this browser was last in, or null. */
export function useLastRoom(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    try {
      setCode(localStorage.getItem(LAST_ROOM_KEY));
    } catch {
      // Same: no way back offered.
    }
  }, []);
  return code;
}
