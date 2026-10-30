import { avatarSchema, type Avatar } from "@brick/game";
import type { Db } from "./index";
import { generateRecoveryKey, hashRecoveryKey, normalizeRecoveryKey } from "./keys";

export interface PlayerRecord {
  id: string;
  nickname: string;
  avatar: Avatar;
  /** Epoch milliseconds. */
  createdAt: number;
}

const select = { id: true, nickname: true, avatar: true, createdAt: true } as const;

const toRecord = (row: { id: string; nickname: string; avatar: unknown; createdAt: Date }): PlayerRecord => ({
  id: row.id,
  nickname: row.nickname,
  avatar: avatarSchema.parse(row.avatar),
  createdAt: row.createdAt.getTime(),
});

/** Nickname and avatar must already be validated (`nicknameSchema`, `avatarSchema`). */
export async function createPlayer(db: Db, nickname: string, avatar: Avatar): Promise<{ player: PlayerRecord; recoveryKey: string }> {
  const recoveryKey = generateRecoveryKey();
  const row = await db.player.create({
    data: { nickname, avatar, keyHash: await hashRecoveryKey(recoveryKey) },
    select,
  });
  return { player: toRecord(row), recoveryKey };
}

export async function getPlayer(db: Db, id: string): Promise<PlayerRecord | null> {
  const row = await db.player.findUnique({ where: { id }, select });
  return row ? toRecord(row) : null;
}

export async function restorePlayer(db: Db, key: string): Promise<PlayerRecord | null> {
  if (!normalizeRecoveryKey(key)) return null;
  const row = await db.player.findUnique({ where: { keyHash: await hashRecoveryKey(key) }, select });
  if (!row) return null;
  await db.player.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
  return toRecord(row);
}

export async function updatePlayer(
  db: Db,
  id: string,
  changes: { nickname?: string; avatar?: Avatar },
): Promise<PlayerRecord | null> {
  const { count } = await db.player.updateMany({ where: { id }, data: { ...changes, lastSeenAt: new Date() } });
  return count ? getPlayer(db, id) : null;
}

/** Replaces the player's key; the old one stops working. `null` if the player doesn't exist. */
export async function regenerateKey(db: Db, id: string): Promise<string | null> {
  const recoveryKey = generateRecoveryKey();
  const { count } = await db.player.updateMany({ where: { id }, data: { keyHash: await hashRecoveryKey(recoveryKey) } });
  return count ? recoveryKey : null;
}
