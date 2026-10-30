import type { Db } from "./index";

/** The UTC day a spend counts towards, as YYYY-MM-DD. */
export const spendDay = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/** Estimated Claude spend so far today (UTC), in US dollars. */
export async function aiSpendToday(db: Db, now: Date = new Date()): Promise<number> {
  const row = await db.aiSpend.findUnique({ where: { day: spendDay(now) }, select: { costMicros: true } });
  return (row?.costMicros ?? 0) / 1_000_000;
}

/** Adds one call's estimated cost to today's total. */
export async function addAiSpend(db: Db, usd: number, now: Date = new Date()) {
  const day = spendDay(now);
  const micros = Math.max(0, Math.ceil(usd * 1_000_000));
  await db.aiSpend.upsert({
    where: { day },
    create: { day, calls: 1, costMicros: micros },
    update: { calls: { increment: 1 }, costMicros: { increment: micros } },
  });
}
