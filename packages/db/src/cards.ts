import type { GameId, Spice } from "@brick/game";
import type { Db } from "./index";

async function existingIds(db: Db, ids: string[]): Promise<Set<string>> {
  const rows = await db.promptCard.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** Keeps Claude-generated cards (content items whose id starts with `ai-`) so they can be rated and not repeated. */
export async function storeGeneratedCards(db: Db, gameId: GameId, spice: Spice, items: { id: string }[]) {
  const cards = items.filter((item) => item.id.startsWith("ai-"));
  if (cards.length === 0) return;
  const existing = await existingIds(db, cards.map((c) => c.id));
  const fresh = cards.filter((c) => !existing.has(c.id));
  if (fresh.length === 0) return;
  await db.promptCard.createMany({
    data: fresh.map((item) => ({ id: item.id, gameId, payload: item, source: "ai", spice })),
  });
}

/** Texts of the most recent Claude cards for a game, to tell Claude what not to repeat. */
export async function recentAiTexts(db: Db, gameId: GameId, limit = 40): Promise<string[]> {
  const rows = await db.promptCard.findMany({
    where: { gameId, source: "ai" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { payload: true },
  });
  return rows.flatMap((row) => {
    const item = row.payload as { text?: string; real?: string };
    return item.text ?? item.real ?? [];
  });
}

/** Ids served most recently for a game, so a new match can avoid the same pack cards. */
export async function recentlyUsedIds(db: Db, gameId: GameId, limit = 60): Promise<string[]> {
  const rows = await db.promptCard.findMany({
    where: { gameId, lastUsedAt: { not: null } },
    orderBy: { lastUsedAt: "desc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Records that cards were served. Pack cards get a row the first time they're used. */
export async function markUsed(db: Db, gameId: GameId, ids: string[]) {
  if (ids.length === 0) return;
  const now = new Date();
  const existing = await existingIds(db, ids);
  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length) {
    await db.promptCard.createMany({
      data: missing.map((id) => ({
        id,
        gameId,
        payload: {},
        source: id.startsWith("ai-") ? "ai" : "pack",
        spice: "unknown",
        lastUsedAt: now,
      })),
    });
  }
  if (existing.size) await db.promptCard.updateMany({ where: { id: { in: [...existing] } }, data: { lastUsedAt: now } });
}
