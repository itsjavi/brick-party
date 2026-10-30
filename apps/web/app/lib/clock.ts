import { useEffect, useRef, useState } from "react";
import { playSfx } from "./audio";

let offset: number | null = null;
/** The match clock's reading while the host has paused it, or `null` while it runs. */
let frozenAt: number | null = null;
let epoch = 0;

/**
 * Folds a server timestamp into the client's estimate of the server's match clock. The clock stands still while
 * `paused`, and jumps when a pause ends (`clockEpoch` changes), so the estimate starts over then.
 */
export function syncClock(serverNow: number, paused = false, clockEpoch = 0) {
  frozenAt = paused ? serverNow : null;
  if (paused) return;
  const sample = serverNow - Date.now();
  offset = offset === null || clockEpoch !== epoch ? sample : offset * 0.8 + sample * 0.2;
  epoch = clockEpoch;
}

/** Whether the host has paused the match clock. */
export function clockPaused(): boolean {
  return frozenAt !== null;
}

export function serverNow(): number {
  return frozenAt ?? Date.now() + (offset ?? 0);
}

/**
 * Seconds left until `endsAt` (server time), re-rendering a few times a second. `fraction` is the
 * share of the phase left, measured from when this deadline was first seen.
 */
export function useCountdown(endsAt: number | null, { ticks = false } = {}) {
  const [now, setNow] = useState(() => serverNow());
  const total = useRef<{ endsAt: number | null; ms: number }>({ endsAt: null, ms: 1 });
  const lastSecond = useRef<number | null>(null);

  if (total.current.endsAt !== endsAt) {
    total.current = { endsAt, ms: endsAt ? Math.max(1, endsAt - serverNow()) : 1 };
  }

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, [endsAt]);

  const msLeft = endsAt ? Math.max(0, endsAt - now) : 0;
  const seconds = Math.ceil(msLeft / 1000);

  useEffect(() => {
    if (!ticks || !endsAt) return;
    if (lastSecond.current !== null && seconds !== lastSecond.current) {
      if (seconds > 0 && seconds <= 5) playSfx("tick");
      if (seconds === 0) playSfx("timeUp");
    }
    lastSecond.current = seconds;
  }, [seconds, ticks, endsAt]);

  return { seconds, msLeft, fraction: endsAt ? Math.min(1, msLeft / total.current.ms) : 0 };
}
