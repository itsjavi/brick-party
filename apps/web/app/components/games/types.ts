import type { Avatar, GameId, PlayerId, Reaction } from "@brick/game";
import type { FloatingReaction, RoomFeed } from "../../lib/room";

export interface Seat {
  id: PlayerId;
  name: string;
  avatar: Avatar;
  online: boolean;
}

/** What every game screen receives from the room. */
export interface GameProps<V> {
  view: V;
  /** The viewer's id, or `null` when spectating this game. */
  me: PlayerId | null;
  /** Participants of this game in seat order. */
  players: Seat[];
  /** The viewer's running total for the match, before this game. */
  matchScore: number;
  isHost: boolean;
  /** Whether Claude judges; screens only mention Claude when it does. */
  ai: boolean;
  act: (action: unknown) => void;
  react: (emoji: Reaction, target?: string) => void;
  reactions: FloatingReaction[];
  /** Host-only: skip the rest of the current phase. */
  skip: () => void;
  /**
   * Every room update as it arrives. During a live game `view` comes only a few times a second; a live screen draws
   * from this instead, outside React.
   */
  feed: RoomFeed;
}

export const GAME_STYLE: Record<
  GameId,
  { color: string; tone: "coral" | "teal" | "grape" | "sun"; tint: "sky" | "dusk" | "mint" }
> = {
  "worst-feedback": { color: "#ff5a4e", tone: "coral", tint: "sky" },
  "bot-or-not": { color: "#00c4b8", tone: "teal", tint: "dusk" },
  "survey-says": { color: "#8b6cff", tone: "grape", tint: "sky" },
  "skip-logic": { color: "#ffcc33", tone: "sun", tint: "mint" },
  "fake-artist": { color: "#f472b6", tone: "coral", tint: "dusk" },
  "brick-brawl": { color: "#38bdf8", tone: "teal", tint: "sky" },
  "in-order": { color: "#5fd068", tone: "teal", tint: "mint" },
  "doodle-champions": { color: "#ff7ab6", tone: "grape", tint: "sky" },
  "paint-grab": { color: "#ff8a1f", tone: "sun", tint: "mint" },
  "hue-clue": { color: "#6366f1", tone: "grape", tint: "dusk" },
  "doodle-smash": { color: "#d946ef", tone: "grape", tint: "dusk" },
  "make-it-worse": { color: "#e0457b", tone: "coral", tint: "dusk" },
};

export function seatOf(players: Seat[], id: PlayerId | null | undefined): Seat | undefined {
  return id ? players.find((p) => p.id === id) : undefined;
}
