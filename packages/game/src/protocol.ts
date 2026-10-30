import { z } from "zod";
import { matchSettingsSchema, type ChatMessage, type MatchView } from "./match";
import type { PlayerId } from "./types";

export const REACTIONS = ["lol", "wow", "plus1", "boo", "bot", "tomato"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(280) }),
  z.object({ type: z.literal("react"), emoji: z.enum(REACTIONS), target: z.string().max(64).optional() }),
  z.object({ type: z.literal("settings"), settings: matchSettingsSchema }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("extend") }),
  z.object({ type: z.literal("again") }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("kick"), playerId: z.string().max(64) }),
  z.object({ type: z.literal("action"), action: z.unknown() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: "state"; view: MatchView }
  | { type: "chat_history"; messages: ChatMessage[] }
  | { type: "chat"; message: ChatMessage }
  | { type: "reaction"; from: PlayerId; emoji: Reaction; target?: string }
  | { type: "kicked" };

/** Claims in the room token the web app signs and the party worker verifies. */
export interface RoomTokenClaims {
  sub: PlayerId;
  name: string;
  avatar: { color: string; hat: string; face: string; shape: string };
  room: string;
}

export const ROOM_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 4;
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`));

export function randomRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  return code;
}

/** What a room reports to the lobby registry for the public "open rooms" list. No nicknames (DECISION-11). */
export interface RoomSummary {
  code: string;
  /** Everyone holding a seat, online or away. */
  players: number;
  /** How many of them stepped away and haven't come back yet. */
  away: number;
  phase: MatchView["phase"];
  gameId: string | null;
  updatedAt: number;
}
