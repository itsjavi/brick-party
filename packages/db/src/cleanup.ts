import { spendDay } from "./ai-spend";
import type { Db } from "./index";

const DAY_MS = 24 * 60 * 60_000;
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/** Marks a player as seen, writing at most once a day, so the daily cleanup keeps them. */
export async function markSeen(db: Db, id: string, now: Date = new Date()) {
  await db.player.updateMany({ where: { id, lastSeenAt: { lt: daysAgo(now, 1) } }, data: { lastSeenAt: now } });
}

/** Players who never finished a match and haven't been seen for `days`: abandoned or scripted bricks. */
export async function pruneIdlePlayers(db: Db, days = 30, now: Date = new Date()): Promise<number> {
  const { count } = await db.player.deleteMany({
    where: { lastSeenAt: { lt: daysAgo(now, days) }, matches: { none: {} } },
  });
  return count;
}

/** Claude cards nobody upvoted that were neither made nor served in the last `days`. */
export async function pruneStaleCards(db: Db, days = 90, now: Date = new Date()): Promise<number> {
  const cutoff = daysAgo(now, days);
  const { count } = await db.promptCard.deleteMany({
    where: {
      source: "ai",
      upvotes: 0,
      createdAt: { lt: cutoff },
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
    },
  });
  return count;
}

/** Daily Claude spend totals older than `days`. */
export async function pruneAiSpend(db: Db, days = 90, now: Date = new Date()): Promise<number> {
  const { count } = await db.aiSpend.deleteMany({ where: { day: { lt: spendDay(daysAgo(now, days)) } } });
  return count;
}
