import { data } from "react-router";
import { OgCard } from "../components/dev/OgCard.stsx";
import type { Route } from "./+types/dev.og";

export const meta: Route.MetaFunction = () => [{ title: "Share card · Brick Party dev" }];

export function loader() {
  if (!import.meta.env.DEV) throw data("Not found", { status: 404 });
  return null;
}

/** The share card on its own, at its real size, for `pnpm og-image` to screenshot. */
export default function DevOg() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#1b1f3b" }}>
      <OgCard />
    </main>
  );
}
