import { data } from "react-router";
import { DrawLab } from "../components/dev/DrawLab.stsx";
import { DevShell } from "../components/dev/DevShell.stsx";
import type { Route } from "./+types/dev.draw";

export const meta: Route.MetaFunction = () => [{ title: "Drawing editors · Brick Party dev" }];

export function loader() {
  if (!import.meta.env.DEV) throw data("Not found", { status: 404 });
  return null;
}

export default function DevDrawLab() {
  return (
    <DevShell>
      <DrawLab />
    </DevShell>
  );
}
