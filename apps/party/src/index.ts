import { routePartykitRequest } from "partyserver";
import type { PartyEnv } from "./env";
import { clientIp, underLimit } from "./limits";

export { GameRoom } from "./game-room";
export { LobbyRegistry, type RoomsMessage } from "./lobby-registry";
export type { PartyEnv } from "./env";
export { cleanUp } from "./cleanup";
export { clientIp, underLimit } from "./limits";
export { openRoomFor, openTestRoom } from "./rooms";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * Handles `/parties/*`: room sockets and the open-rooms list. Returns `null` for any other path
 * so the caller can hand the request to the app.
 */
export async function handlePartyRequest(request: Request, env: PartyEnv): Promise<Response | null> {
  if (!new URL(request.url).pathname.startsWith("/parties/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!(await underLimit(env.SOCKET_LIMITER, `socket:${clientIp(request)}`))) {
    return new Response("Too many requests", { status: 429, headers: { ...CORS, "Retry-After": "60" } });
  }
  const response = await routePartykitRequest(request, env as unknown as Cloudflare.Env, {
    // Browsers only open sockets and read the lobby list. Rooms update the registry through a
    // stub, which doesn't come through here, so outside POSTs can't fake rooms.
    onBeforeRequest: (req, lobby) =>
      lobby.className === ("LobbyRegistry" as typeof lobby.className) && req.method === "GET"
        ? undefined
        : new Response("Not found", { status: 404 }),
  });
  if (!response) return new Response("Not found", { status: 404 });
  if (response.status === 101) return response;
  const withCors = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS)) withCors.headers.set(k, v);
  return withCors;
}
