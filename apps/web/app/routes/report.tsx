import { data } from "react-router";
import { PageShell } from "../components/PageShell.stsx";
import { RetroReport } from "../components/room/RetroReport.stsx";
import { LinkButton } from "../components/ui/LinkButton.stsx";
import { currentPlayer } from "../lib/session.server";
import { getMatch } from "../lib/store.server";
import type { Route } from "./+types/report";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [match, player] = await Promise.all([getMatch(params.matchId), currentPlayer(request)]);
  if (!match) throw data("Match not found", { status: 404 });
  return { report: match.report, me: player?.id ?? null };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `Retro Report · Room ${loaderData.report.code} · Brick Party` : "Retro Report · Brick Party" },
];

export default function Report({ loaderData }: Route.ComponentProps) {
  return (
    <PageShell back="/hall-of-fame">
      <RetroReport
        report={loaderData.report}
        me={loaderData.me}
        actions={
          <>
            <LinkButton to="/hall-of-fame">
              Hall of Fame
            </LinkButton>
            <LinkButton to="/">
              Play again
            </LinkButton>
          </>
        }
      />
    </PageShell>
  );
}
