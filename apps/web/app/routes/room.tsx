import { roomCodeSchema } from "@brick/game";
import { data, redirect } from "react-router";
import { RoomScreen } from "../components/room/RoomScreen.stsx";
import { underRoomLimit } from "../lib/protect.server";
import { requirePlayer } from "../lib/session.server";
import { roomToken } from "../lib/token.server";
import type { Route } from "./+types/room";

export async function loader({ request, params }: Route.LoaderArgs) {
  const code = roomCodeSchema.safeParse(params.code);
  if (!code.success) throw data("No such room", { status: 404 });
  if (code.data !== params.code) throw redirect(`/r/${code.data}`);
  const player = await requirePlayer(request);
  if (!(await underRoomLimit(player.id))) throw data("You're opening rooms too fast. Wait a minute and try again.", { status: 429 });
  return { code: code.data, token: await roomToken(player, code.data), me: player.id };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Room ${loaderData?.code ?? ""} · Brick Party` }];

export default function Room({ loaderData }: Route.ComponentProps) {
  return <RoomScreen {...loaderData} />;
}
