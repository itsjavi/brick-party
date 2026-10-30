import type { DoodleSmashView, SmashFighterView } from "@brick/game";

/**
 * The fighters as a Doodle Smash screen knows them. During the fight, views carry names and specs only now and then,
 * and the drawings even less often, so they're kept here between views (for each game's set of drawings). It takes
 * every view, React's and the live feed's alike, and keeps the same list until something in it changes.
 */
export class RosterKeeper {
  #version = 0;
  #fighters: SmashFighterView[] = [];

  /** Takes in a view's fighters, if it carries any. Returns whether the roster changed. */
  take(view: Pick<DoodleSmashView, "fighters" | "drawingsVersion">): boolean {
    if (!view.fighters.length) return false;
    const before = this.#version === view.drawingsVersion ? this.#fighters : [];
    const next = view.fighters.map((f) => {
      const old = before.find((o) => o.id === f.id);
      return f.strokes || !old ? f : { ...f, strokes: old.strokes, rig: old.rig, stats: old.stats };
    });
    const same =
      this.#version === view.drawingsVersion &&
      next.length === before.length &&
      next.every((f, i) => {
        const old = before[i]!;
        return f.id === old.id && f.name === old.name && !!f.strokes === !!old.strokes;
      });
    if (same) return false;
    this.#version = view.drawingsVersion;
    this.#fighters = next;
    return true;
  }

  /** The fighters for this set of drawings, or none yet. */
  fighters(drawingsVersion: number): SmashFighterView[] {
    return this.#version === drawingsVersion ? this.#fighters : [];
  }
}
