import type { AiConfig } from "@brick/content/ai";
import { addAiSpend, aiSpendToday, type Db } from "@brick/db";
import type { GameRoom } from "./game-room";
import type { LobbyRegistry } from "./lobby-registry";

/** The Worker bindings the party code needs. The app's Worker (apps/web) provides them. */
export interface PartyEnv {
  DB: D1Database;
  GameRoom: DurableObjectNamespace<GameRoom>;
  LobbyRegistry: DurableObjectNamespace<LobbyRegistry>;
  SESSION_SECRET: string;
  /** Verifies the room tokens the web app signs. */
  GAME_JWT_SECRET: string;
  /** `"true"` turns Claude on, if there's also a key. Anything else: packs and the fuzzy judge. */
  AI_ENABLED?: string;
  ANTHROPIC_API_KEY?: string;
  CONTENT_MODEL?: string;
  JUDGE_MODEL?: string;
  /** Estimated Claude spend allowed per UTC day, in US dollars (default 3). */
  AI_DAILY_BUDGET_USD?: string;
  /** Multiplies every phase duration ("1" in production). */
  GAME_PACE?: string;
  /** Per-IP limit on opening room and lobby sockets (wrangler.jsonc `ratelimits`). */
  SOCKET_LIMITER?: RateLimit;
}

/**
 * partyserver's `Server` requires its env to extend `Cloudflare.Env`, which the app's generated
 * worker types fill in. Intersecting keeps both sides happy.
 */
export type ServerEnv = PartyEnv & Cloudflare.Env;

const DEFAULT_DAILY_BUDGET_USD = 3;

export function dailyBudgetUsd(env: PartyEnv): number {
  const raw = env.AI_DAILY_BUDGET_USD?.trim();
  const usd = raw ? Number(raw) : DEFAULT_DAILY_BUDGET_USD;
  return Number.isFinite(usd) && usd >= 0 ? usd : DEFAULT_DAILY_BUDGET_USD;
}

/** Claude settings, with the daily budget kept in D1 when a database is given. */
export const aiConfig = (env: PartyEnv, db?: Db): AiConfig => ({
  enabled: env.AI_ENABLED?.trim().toLowerCase() === "true",
  apiKey: env.ANTHROPIC_API_KEY,
  contentModel: env.CONTENT_MODEL,
  judgeModel: env.JUDGE_MODEL,
  budget: db && {
    allows: async () => (await aiSpendToday(db)) < dailyBudgetUsd(env),
    spend: (usd) => addAiSpend(db, usd),
  },
});
