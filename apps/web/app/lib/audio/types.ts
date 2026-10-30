export type SfxName =
  | "click"
  | "pop"
  | "join"
  | "leave"
  | "chat"
  | "tick"
  | "timeUp"
  | "reveal"
  | "vote"
  | "point"
  | "win"
  | "lose"
  | "whoosh"
  | "react"
  | "start"
  | "heart"
  | "error"
  | "reactLol"
  | "reactWow"
  | "reactPlus1"
  | "reactBoo"
  | "reactBot"
  | "reactTomato"
  | "thud"
  | "bump"
  | "fall"
  | "shield"
  | "crumble"
  | "drop"
  | "laser"
  | "slash"
  | "hit"
  | "smash"
  | "ko"
  | "powerUp"
  | "shatter"
  | "charge";

export type MusicMood = "off" | "lobby" | "think" | "tension" | "battle" | "reveal" | "results";

export interface AudioSettings {
  /** 0..1 */
  music: number;
  /** 0..1 */
  sfx: number;
  muted: boolean;
}
