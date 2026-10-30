import { gameIdSchema } from "@brick/game";
import { openTestRoom } from "@brick/party";
import { data, redirect } from "react-router";
import { appEnv } from "../lib/cloudflare.server";
import { underFormLimit } from "../lib/protect.server";
import { requirePlayer } from "../lib/session.server";
import type { Route } from "./+types/test";

/** "Test it" (TASK-39): a private room for one game, with bots in the other seats. Needs a brick, like any room. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const gameId = gameIdSchema.safeParse(params.gameId);
  if (!gameId.success) throw data("No such game", { status: 404 });
  await requirePlayer(request);
  if (!(await underFormLimit(request, "test-room"))) {
    throw data("You're starting test games too fast. Wait a minute and try again.", { status: 429 });
  }
  const code = await openTestRoom(appEnv(), gameId.data);
  if (!code) throw data("No free room codes right now. Try again in a minute.", { status: 503 });
  throw redirect(`/r/${code}`);
}
