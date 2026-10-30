import type { MatchView } from "@brick/game";
import { situationKey } from "./moves";

/** A guard for endless matches, which never pass through the lobby. */
const MAX_REMEMBERED = 5000;

/**
 * What the autopilot has already done, so each bot acts once per moment of a match. A moment is keyed on where the
 * room is (`situationKey`), and those keys repeat when the host plays again, so the memory starts over whenever the
 * room is back in the lobby.
 */
export class AutopilotMemory {
  #done = new Set<string>();
  #due = new Map<string, number>();

  /** Notes a room update: back in the lobby means a new match is coming, so everything is forgotten. */
  see(view: MatchView) {
    if (view.phase !== "lobby") return;
    this.#done.clear();
    this.#due.clear();
  }

  /** True the first time `bot` does `what` at this moment of the match, false after that. */
  once(bot: string, view: MatchView, what: string): boolean {
    const key = `${bot}|${situationKey(view)}|${what}`;
    if (this.#done.has(key)) return false;
    if (this.#done.size >= MAX_REMEMBERED) this.#done.clear();
    this.#done.add(key);
    return true;
  }

  /** When `bot` should act at this moment: `pick()` the first time it's asked, the same answer after that. */
  dueAt(bot: string, view: MatchView, pick: () => number): number {
    const key = `${bot}|${situationKey(view)}`;
    if (!this.#due.has(key)) {
      if (this.#due.size >= MAX_REMEMBERED) this.#due.clear();
      this.#due.set(key, pick());
    }
    return this.#due.get(key)!;
  }
}
