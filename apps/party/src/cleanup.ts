import { createDb, pruneAiSpend, pruneIdlePlayers, pruneRooms, pruneStaleCards } from "@brick/db";
import type { PartyEnv } from "./env";

/**
 * The daily cron: removes data nothing needs any more, and frees room codes. Rooms wipe their own
 * state after a day empty, so this only covers D1. Kept to a few queries: on the free plan a cron
 * gets 10 ms of CPU.
 */
export async function cleanUp(env: PartyEnv, now: Date = new Date()) {
  const db = createDb(env.DB);
  const jobs = {
    "idle players": () => pruneIdlePlayers(db, 30, now),
    "old Claude cards": () => pruneStaleCards(db, 90, now),
    "old spend days": () => pruneAiSpend(db, 90, now),
    "room codes unused for 30 days": () => pruneRooms(db, now),
  };
  for (const [what, job] of Object.entries(jobs)) {
    try {
      console.log(`[cleanup] removed ${await job()} ${what}`);
    } catch (error) {
      console.warn(`[cleanup] removing ${what} failed`, error instanceof Error ? error.message : error);
    }
  }
}
