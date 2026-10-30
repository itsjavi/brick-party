import type { Db } from "./index";

const DAY_MS = 24 * 60 * 60_000;
/** A code stays its creator's for this long after its last use (DECISION-13). */
export const ROOM_KEEP_DAYS = 30;
/** Playing in a room refreshes its last use at most this often. */
const TOUCH_INTERVAL_MS = 60 * 60_000;

const keptSince = (now: Date) => new Date(now.getTime() - ROOM_KEEP_DAYS * DAY_MS);

/** The code this player created and used in the last 30 days, if any. */
export async function ownedRoom(db: Db, ownerId: string, now: Date = new Date()): Promise<string | null> {
  const room = await db.room.findFirst({ where: { ownerId, lastUsedAt: { gte: keptSince(now) } }, select: { code: true } });
  return room?.code ?? null;
}

/** Whether someone else holds `code` (used in the last 30 days). */
export async function roomTaken(db: Db, code: string, ownerId: string, now: Date = new Date()): Promise<boolean> {
  const room = await db.room.findUnique({ where: { code }, select: { ownerId: true, lastUsedAt: true } });
  return !!room && room.ownerId !== ownerId && room.lastUsedAt >= keptSince(now);
}

/**
 * Makes `code` this player's, dropping any other code they held. Succeeds if the code is free,
 * expired, or already theirs; `false` if someone else got it first.
 */
export async function claimRoom(db: Db, code: string, ownerId: string, now: Date = new Date()): Promise<boolean> {
  await db.room.deleteMany({ where: { ownerId, code: { not: code } } });
  const { count } = await db.room.updateMany({
    where: { code, OR: [{ ownerId }, { lastUsedAt: { lt: keptSince(now) } }] },
    data: { ownerId, lastUsedAt: now },
  });
  if (count) return true;
  try {
    await db.room.create({ data: { code, ownerId, createdAt: now, lastUsedAt: now } });
    return true;
  } catch {
    return false;
  }
}

/** Records that a room is in use, writing at most once an hour. Rooms nobody created are skipped. */
export async function touchRoom(db: Db, code: string, now: Date = new Date()) {
  await db.room.updateMany({
    where: { code, lastUsedAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } },
    data: { lastUsedAt: now },
  });
}

/** Frees codes nobody has used for 30 days. */
export async function pruneRooms(db: Db, now: Date = new Date()): Promise<number> {
  const { count } = await db.room.deleteMany({ where: { lastUsedAt: { lt: keptSince(now) } } });
  return count;
}
