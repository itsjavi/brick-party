import { data } from "react-router";
import { DevShell } from "../components/dev/DevShell.stsx";
import { AudioLab } from "../components/ui/AudioLab.stsx";
import type { Route } from "./+types/dev.audio";

export const meta: Route.MetaFunction = () => [{ title: "Audio lab · Brick Party dev" }];

export function loader() {
  if (!import.meta.env.DEV) throw data("Not found", { status: 404 });
  return null;
}

export default function DevAudio() {
  return (
    <DevShell>
      <AudioLab />
    </DevShell>
  );
}
