import { clientIp, underLimit } from "@brick/party";
import { appEnv } from "./cloudflare.server";

export { clientIp };

/** Secrets `wrangler types` only sees when they're in .dev.vars. */
interface ProtectionEnv {
  FORM_LIMITER?: RateLimit;
  SOCKET_LIMITER?: RateLimit;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

const env = () => appEnv() as unknown as ProtectionEnv;

/** Per-IP limit on forms (new players, restores, new rooms): `key` names what's being limited. */
export function underFormLimit(request: Request, key: string): Promise<boolean> {
  return underLimit(env().FORM_LIMITER, `${key}:${clientIp(request)}`);
}

/** Limit on minting room tokens, per player. */
export function underRoomLimit(playerId: string): Promise<boolean> {
  return underLimit(env().SOCKET_LIMITER, `room:${playerId}`);
}

/** The public Turnstile site key, or `null` when Turnstile is off (both keys are needed). */
export function turnstileSiteKey(): string | null {
  const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY } = env();
  return TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY ? TURNSTILE_SITE_KEY : null;
}

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Checks the form's Turnstile token with Cloudflare. Tokens last five minutes and work once.
 * Always passes when Turnstile is off; fails closed when Cloudflare can't be reached.
 */
export async function passedTurnstile(request: Request, token: FormDataEntryValue | null): Promise<boolean> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!turnstileSiteKey() || !secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  const ip = clientIp(request);
  if (ip !== "local") body.set("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const outcome = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!outcome.success) console.warn("turnstile rejected a token", outcome["error-codes"]);
    return outcome.success === true;
  } catch (error) {
    console.warn("turnstile check failed", error instanceof Error ? error.message : error);
    return false;
  }
}
