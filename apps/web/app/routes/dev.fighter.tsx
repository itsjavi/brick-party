import { data } from "react-router";
import { FighterLab } from "../components/dev/FighterLab.stsx";
import { DevShell } from "../components/dev/DevShell.stsx";
import type { Route } from "./+types/dev.fighter";

export const meta: Route.MetaFunction = () => [{ title: "Fighter viewer · Brick Party dev" }];

export function loader() {
  if (!import.meta.env.DEV) throw data("Not found", { status: 404 });
  return null;
}

export default function DevFighterLab() {
  return (
    <DevShell wide>
      <FighterLab />
    </DevShell>
  );
}
