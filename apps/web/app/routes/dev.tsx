import { data } from "react-router";
import { DevIndex } from "../components/dev/DevIndex.stsx";
import { DevShell } from "../components/dev/DevShell.stsx";
import type { Route } from "./+types/dev";

export const meta: Route.MetaFunction = () => [{ title: "Dev sandboxes · Brick Party dev" }];

export function loader() {
  if (!import.meta.env.DEV) throw data("Not found", { status: 404 });
  return null;
}

export default function DevIndexPage() {
  return (
    <DevShell>
      <DevIndex />
    </DevShell>
  );
}
