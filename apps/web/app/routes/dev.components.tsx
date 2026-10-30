import { data } from "react-router";
import { ComponentGallery } from "../components/dev/ComponentGallery.stsx";
import { DevShell } from "../components/dev/DevShell.stsx";
import type { Route } from "./+types/dev.components";

export const meta: Route.MetaFunction = () => [{ title: "Components · Brick Party dev" }];

export function loader() {
  if (!import.meta.env.DEV) throw data("Not found", { status: 404 });
  return null;
}

export default function DevComponentGallery() {
  return (
    <DevShell>
      <ComponentGallery />
    </DevShell>
  );
}
