import { HallOfFameScreen } from "../components/HallOfFameScreen.stsx";
import { currentPlayer } from "../lib/session.server";
import { hallOfFame } from "../lib/store.server";
import type { Route } from "./+types/hall-of-fame";

export const meta: Route.MetaFunction = () => [{ title: "Hall of Fame · Brick Party" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [fame, player] = await Promise.all([hallOfFame(), currentPlayer(request)]);
  return { ...fame, me: player?.id ?? null };
}

export default function HallOfFame({ loaderData }: Route.ComponentProps) {
  return <HallOfFameScreen players={loaderData.players} recent={loaderData.recent} me={loaderData.me} />;
}
