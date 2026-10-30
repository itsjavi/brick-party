import { z } from "zod";

export const AVATAR_COLORS = ["teal", "coral", "sun", "grape", "sky", "lime", "rose", "slate"] as const;
export const AVATAR_HATS = ["none", "cap", "crown", "party", "tophat", "beanie", "headset", "halo"] as const;
export const AVATAR_FACES = ["classic", "blush", "glasses", "shades", "mustache", "cyclops", "freckles", "brows"] as const;
export const AVATAR_SHAPES = ["brick", "round", "triple", "tile", "jelly", "slim"] as const;

export const avatarSchema = z.object({
  color: z.enum(AVATAR_COLORS),
  hat: z.enum(AVATAR_HATS),
  // Faces and shapes came later: avatars saved before them get the original look.
  face: z.enum(AVATAR_FACES).default("classic"),
  shape: z.enum(AVATAR_SHAPES).default("brick"),
});
export type Avatar = z.infer<typeof avatarSchema>;
/** An avatar that may lack a face or shape, like one saved before they existed; `avatarSchema` fills them in. */
export type AvatarInput = z.input<typeof avatarSchema>;

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "Pick a nickname")
  .max(20, "20 characters max")
  .regex(/^[^<>]+$/, "No angle brackets");

export type PlayerId = string;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  avatar: Avatar;
}

export const GAME_IDS = ["worst-feedback", "bot-or-not", "survey-says", "skip-logic", "fake-artist", "brick-brawl", "in-order", "doodle-champions", "paint-grab", "hue-clue", "doodle-smash", "make-it-worse"] as const;
export type GameId = (typeof GAME_IDS)[number];
export const gameIdSchema = z.enum(GAME_IDS);

/** What kind of game it is, for filtering the list of games; a game can be more than one. */
export const GAME_CATEGORIES = ["words", "drawing", "action", "guessing"] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const SPICE_LEVELS = ["mild", "spicy"] as const;
export type Spice = (typeof SPICE_LEVELS)[number];

/** What a room asks the content service for when a game is about to start. */
export interface ContentRequest {
  gameId: GameId;
  spice: Spice;
  /** Number of prompts/questions/pairs the game will consume. */
  count: number;
  /** Extra items some games need, e.g. answer cards for Worst Feedback Ever. */
  extraCount?: number;
  /** Prompt ids already used in this match. */
  avoid: string[];
}

/** Per-player counters a game reports for awards, e.g. `{ promoterVotes: 3 }`. */
export type GameStats = Record<PlayerId, Record<string, number>>;
