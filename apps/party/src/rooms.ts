import { claimRoom, createDb, ownedRoom, roomTaken } from "@brick/db";
import { randomRoomCode, type GameId } from "@brick/game";
import { getServerByName } from "partyserver";
import type { PartyEnv } from "./env";

/** Random codes tried before giving up. With 160,000 codes and few rooms, one is nearly always enough. */
const ATTEMPTS = 20;

/** Starts a room over, unless someone is in it right now. */
async function restartRoom(env: Pick<PartyEnv, "GameRoom">, code: string): Promise<"restarted" | "busy"> {
  const room = await getServerByName(env.GameRoom, code);
  return room.restart();
}

/**
 * The room "Create a room" sends a player to (DECISION-13): their own code if they used it in
 * the last 30 days, otherwise a code nobody holds and nobody is in. Either way the room starts
 * fresh, unless people are in it right now. `null` when no free code turned up.
 */
export async function openRoomFor(env: Pick<PartyEnv, "DB" | "GameRoom">, playerId: string): Promise<string | null> {
  const db = createDb(env.DB);
  const own = await ownedRoom(db, playerId);
  if (own) {
    await claimRoom(db, own, playerId);
    await restartRoom(env, own);
    return own;
  }
  for (let i = 0; i < ATTEMPTS; i++) {
    const code = randomRoomCode();
    if (await roomTaken(db, code, playerId)) continue;
    if ((await restartRoom(env, code)) === "busy") continue;
    if (await claimRoom(db, code, playerId)) return code;
  }
  return null;
}

/**
 * A fresh "Test it" room for `gameId` (TASK-39): a code nobody holds and nobody is in, set up with bots. It isn't
 * claimed, so it never counts as anyone's own room. `null` when no free code turned up.
 */
export async function openTestRoom(env: Pick<PartyEnv, "DB" | "GameRoom">, gameId: GameId): Promise<string | null> {
  const db = createDb(env.DB);
  for (let i = 0; i < ATTEMPTS; i++) {
    const code = randomRoomCode();
    if (await roomTaken(db, code, "")) continue;
    const room = await getServerByName(env.GameRoom, code);
    if ((await room.startTest(gameId)) === "ready") return code;
  }
  return null;
}
