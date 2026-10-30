import { KEY_MASK } from "./smash-sim";

/** The fight input a player sends: the keys held, and the attack key going down or up. */
export interface SmashInputMessage {
  type: "input";
  held: number;
  attack: "press" | "release" | null;
  seq: number;
}

/**
 * The shortest gap between two input messages. A room takes 8 messages a second from a connection on average (with
 * bursts of 20, DECISION-11); this leaves a little of that for chat and reactions during a fight.
 */
export const SMASH_INPUT_GAP_MS = 130;

/**
 * Turns key changes into input messages for the room: one as soon as something changes, then at most one per `gapMs`,
 * always with the latest keys. A press is never lost however short it is: a key that went down and up between two
 * messages goes out held in the first and let go in the next, and the attack key's presses and releases go out one
 * per message, in order.
 */
export class SmashInputQueue {
  seq = 0;
  #held = 0;
  #attack = false;
  /** What the room has been sent. */
  #sentHeld = 0;
  #sentAttack = false;
  /** Keys that went down since the last message. */
  #pressed = 0;
  /** Attack key changes not sent yet, oldest first. */
  #changes: ("press" | "release")[] = [];
  #lastAt = Number.NEGATIVE_INFINITY;

  constructor(readonly gapMs = SMASH_INPUT_GAP_MS) {}

  /** The keys held now, and whether the attack key is down. */
  set(held: number, attack: boolean) {
    const keys = held & KEY_MASK;
    this.#pressed |= keys & ~this.#held;
    this.#held = keys;
    if (attack !== this.#attack) {
      this.#attack = attack;
      const change = attack ? "press" : "release";
      // A change cancels the one still waiting before it (a tap the room never heard of), but a press waiting to go
      // out stays, so a quick tap still lands.
      const last = this.#changes.at(-1);
      if (last && last !== change && this.#changes.length > 1) this.#changes.pop();
      else this.#changes.push(change);
      if (this.#changes.length > 2) this.#changes.splice(0, this.#changes.length - 2);
    }
  }

  /** Whether the room is behind the keys. */
  get dirty(): boolean {
    return (
      this.#changes.length > 0 || this.#sentHeld !== this.#held || (this.#pressed & ~this.#sentHeld) !== 0
    );
  }

  /** The message to send at `now`, or `null` when there's nothing new or it's too soon. */
  take(now: number): SmashInputMessage | null {
    if (!this.dirty || now - this.#lastAt < this.gapMs) return null;
    let attack: SmashInputMessage["attack"] = null;
    const next = this.#changes.shift();
    if (next === "press" && !this.#sentAttack) attack = "press";
    else if (next === "release" && this.#sentAttack) attack = "release";
    if (attack) this.#sentAttack = attack === "press";
    // A key pressed and let go since the last message goes out held once.
    const held = this.#held | (this.#pressed & ~this.#sentHeld);
    this.#pressed = 0;
    this.#sentHeld = held;
    this.#lastAt = now;
    this.seq += 1;
    return { type: "input", held, attack, seq: this.seq };
  }

  /** Forgets everything, for a new fight. */
  reset() {
    this.#held = 0;
    this.#attack = false;
    this.#sentHeld = 0;
    this.#sentAttack = false;
    this.#pressed = 0;
    this.#changes = [];
    this.#lastAt = Number.NEGATIVE_INFINITY;
  }
}
