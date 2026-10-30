import { createCookie, redirect, type Cookie } from "react-router";
import { appEnv, waitUntil } from "./cloudflare.server";
import { getPlayer, markSeen, type PlayerRecord } from "./store.server";

let cookie: Cookie | null = null;

/** The signed cookie that remembers which player this browser is. */
function playerCookie(): Cookie {
  cookie ??= createCookie("bp_player", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: !import.meta.env.DEV,
    maxAge: 60 * 60 * 24 * 400,
    secrets: [appEnv().SESSION_SECRET],
  });
  return cookie;
}

export async function currentPlayer(request: Request): Promise<PlayerRecord | null> {
  const id: unknown = await playerCookie().parse(request.headers.get("Cookie"));
  if (typeof id !== "string" || !id) return null;
  const player = await getPlayer(id);
  // Keeps active players out of the daily cleanup of idle bricks.
  if (player) waitUntil(markSeen(player.id).catch((error) => console.warn("couldn't mark a player seen", error)));
  return player;
}

/** Sends players without an identity to the title screen, coming back here afterwards. */
export async function requirePlayer(request: Request): Promise<PlayerRecord> {
  const player = await currentPlayer(request);
  if (!player) {
    const url = new URL(request.url);
    throw redirect(`/?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return player;
}

export function rememberPlayer(playerId: string): Promise<string> {
  return playerCookie().serialize(playerId);
}

export function forgetPlayer(): Promise<string> {
  return playerCookie().serialize("", { maxAge: 0 });
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
