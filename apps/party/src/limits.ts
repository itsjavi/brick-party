/** The visitor's IP as Cloudflare saw it. Local dev has none, so everyone shares one bucket. */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

/**
 * Whether `key` is still under a Workers rate limit (DECISION-11). Counts are kept per Cloudflare
 * location and are approximate. Without the binding, nothing is limited.
 */
export async function underLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch (error) {
    console.warn("rate limiter failed, letting the request through", error instanceof Error ? error.message : error);
    return true;
  }
}

/**
 * A token bucket for one connection's messages: `perSecond` on average, bursts up to `burst`.
 * Lives in memory, so it resets when the room restarts.
 */
export class MessageBucket {
  #tokens: number;
  #at: number;

  constructor(
    private perSecond: number,
    private burst: number,
    now: number,
  ) {
    this.#tokens = burst;
    this.#at = now;
  }

  /** Takes a token for one message; `false` when the connection is sending too fast. */
  take(now: number): boolean {
    this.#tokens = Math.min(this.burst, this.#tokens + ((now - this.#at) / 1000) * this.perSecond);
    this.#at = now;
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}

/**
 * Runs `run` at most once per `intervalMs`. A request runs it at once when it's urgent or the last run is old enough;
 * otherwise one run follows when the interval is up, covering every request in between. Lives in memory.
 */
export class Throttle {
  #last = Number.NEGATIVE_INFINITY;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private intervalMs: number,
    private run: () => void,
  ) {}

  /** Changes the interval; a run already waiting keeps its time. */
  every(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  request(urgent = false) {
    const wait = this.#last + this.intervalMs - Date.now();
    if (urgent || wait <= 0) this.now();
    else this.#timer ??= setTimeout(() => this.now(), wait);
  }

  /** Runs it now, in place of any run that was waiting. */
  now() {
    this.cancel();
    this.#last = Date.now();
    this.run();
  }

  /** Drops the run that was waiting, if any. */
  cancel() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
