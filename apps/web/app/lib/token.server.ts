import type { RoomTokenClaims } from "@brick/game";
import { SignJWT } from "jose";
import { appEnv } from "./cloudflare.server";
import type { PlayerRecord } from "./store.server";

/** A token the game room accepts as proof of who is joining which room. */
export async function roomToken(player: PlayerRecord, room: string): Promise<string> {
  const claims: Omit<RoomTokenClaims, "sub"> = { name: player.nickname, avatar: player.avatar, room };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(player.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(appEnv().GAME_JWT_SECRET));
}
