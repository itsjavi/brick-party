import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("r/:code", "routes/room.tsx"),
  route("test/:gameId", "routes/test.tsx"),
  route("profile", "routes/profile.tsx"),
  route("hall-of-fame", "routes/hall-of-fame.tsx"),
  route("report/:matchId", "routes/report.tsx"),
  // Local development only: each loader throws a 404 on the live site.
  route("dev", "routes/dev.tsx"),
  route("dev/draw", "routes/dev.draw.tsx"),
  route("dev/fighter", "routes/dev.fighter.tsx"),
  route("dev/components", "routes/dev.components.tsx"),
  route("dev/audio", "routes/dev.audio.tsx"),
  route("dev/og", "routes/dev.og.tsx"),
  route("favicon.ico", "routes/favicon.ts"),
] satisfies RouteConfig;
