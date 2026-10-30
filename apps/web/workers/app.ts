import { GameRoom, LobbyRegistry, cleanUp, handlePartyRequest } from "@brick/party";
import { createRequestHandler } from "react-router";

// Durable Object classes must be exported from the Worker's main module.
export { GameRoom, LobbyRegistry };

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  // Room sockets and the open-rooms list go to the party server; everything else is the app.
  // Loaders read bindings with `appEnv()` (app/lib/cloudflare.server.ts), not the load context.
  async fetch(request, env) {
    return (await handlePartyRequest(request, env)) ?? requestHandler(request);
  },
  // The daily cleanup (`triggers` in wrangler.jsonc). Locally: GET /cdn-cgi/local/scheduled.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanUp(env));
  },
} satisfies ExportedHandler<Env>;
