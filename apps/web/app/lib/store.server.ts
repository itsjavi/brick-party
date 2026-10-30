import {
  createDb,
  createPlayer as dbCreatePlayer,
  getMatch as dbGetMatch,
  getPlayer as dbGetPlayer,
  hallOfFame as dbHallOfFame,
  markSeen as dbMarkSeen,
  regenerateKey as dbRegenerateKey,
  restorePlayer as dbRestorePlayer,
  updatePlayer as dbUpdatePlayer,
  type HallOfFame,
  type PlayerRecord,
  type StoredMatch,
} from "@brick/db";
import { avatarSchema, nicknameSchema, type Avatar } from "@brick/game";
import { appEnv } from "./cloudflare.server";

export type { HallOfFame, PlayerRecord, StoredMatch };

/** Players, matches and the hall of fame, in D1 through Prisma. */
const db = () => createDb(appEnv().DB);

/** Throws a ZodError for an invalid nickname or avatar. */
export function createPlayer(input: { nickname: string; avatar: Avatar }) {
  return dbCreatePlayer(db(), nicknameSchema.parse(input.nickname), avatarSchema.parse(input.avatar));
}

export function getPlayer(id: string): Promise<PlayerRecord | null> {
  return dbGetPlayer(db(), id);
}

/** Records that the player is still around, at most once a day. */
export function markSeen(id: string): Promise<void> {
  return dbMarkSeen(db(), id);
}

/** Accepts sloppy keys (lowercase, spaces, missing dashes). `null` when no player has it. */
export function restorePlayer(key: string): Promise<PlayerRecord | null> {
  return dbRestorePlayer(db(), key);
}

export async function updatePlayer(id: string, patch: { nickname?: string; avatar?: Avatar }): Promise<PlayerRecord> {
  const player = await dbUpdatePlayer(db(), id, {
    ...(patch.nickname !== undefined && { nickname: nicknameSchema.parse(patch.nickname) }),
    ...(patch.avatar !== undefined && { avatar: avatarSchema.parse(patch.avatar) }),
  });
  if (!player) throw new Error(`Player ${id} not found`);
  return player;
}

/** Issues a new recovery key; the old one stops working. */
export async function regenerateKey(id: string): Promise<string> {
  const key = await dbRegenerateKey(db(), id);
  if (!key) throw new Error(`Player ${id} not found`);
  return key;
}

export function getMatch(id: string): Promise<StoredMatch | null> {
  return dbGetMatch(db(), id);
}

export function hallOfFame(): Promise<HallOfFame> {
  return dbHallOfFame(db());
}
