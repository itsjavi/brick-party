import { liveTickMs, type MatchState } from "@brick/game";

/**
 * How often room updates go out at most while the room stays in the same moment. A live game's fight (DECISION-19)
 * goes out faster, so other fighters move smoothly; everything else is coalesced to a few updates a second.
 */
export const BROADCAST_INTERVAL_MS = 125;
export const LIVE_BROADCAST_INTERVAL_MS = 66;

/**
 * How fast the room ticks the match from memory right now, or `null` for not at all: only while a live game runs, the
 * match isn't paused, and someone is connected to play it or watch.
 */
export function liveRate(match: MatchState, anyoneHere: boolean): number | null {
  return anyoneHere ? liveTickMs(match) : null;
}

/** The update interval for a tick rate from `liveRate`. */
export const broadcastInterval = (rate: number | null) =>
  rate === null ? BROADCAST_INTERVAL_MS : LIVE_BROADCAST_INTERVAL_MS;

/**
 * A live game's ticks: an interval in memory, not storage alarms, so ticking costs no writes. `set` starts, changes or
 * stops it; it lives as long as the room is in memory, which an open socket guarantees.
 */
export class LiveTicker {
  #timer: ReturnType<typeof setInterval> | null = null;
  #rate: number | null = null;

  constructor(private tick: () => void) {}

  /** The current rate in ms, or `null` when stopped. */
  get rate(): number | null {
    return this.#rate;
  }

  set(rate: number | null) {
    if (rate === this.#rate) return;
    this.stop();
    if (rate === null) return;
    this.#rate = rate;
    this.#timer = setInterval(() => this.tick(), rate);
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#rate = null;
  }
}
