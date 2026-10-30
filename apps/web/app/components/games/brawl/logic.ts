/** Brick Brawl's screen logic, kept free of React and canvas so it can be tested on its own. */
import {
  onArena,
  resolveTurn,
  type BrawlBrick,
  type BrawlEvent,
  type BrawlMove,
  type BrickBrawlView,
  type PlayerId,
} from "@brick/game";
import type { SfxName } from "../../../lib/audio/types";

export type Dir = "up" | "down" | "left" | "right";
export type MoveType = BrawlMove["type"];
export const DIRS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const ARROWS: Record<Dir, string> = { up: "↑", down: "↓", left: "←", right: "→" };

export const needsDir = (type: MoveType) => type === "step" || type === "dash" || type === "shove";
export const sameMove = (a: BrawlMove | null, b: BrawlMove | null) =>
  !!a && !!b && a.type === b.type && ("dir" in a ? a.dir : null) === ("dir" in b ? b.dir : null);

/** The turn as if everyone else stood still: where `me` and anyone `me` touches would end up. */
export function simulate(view: BrickBrawlView, me: PlayerId, move: BrawlMove) {
  const round = {
    size: view.size,
    ring: view.ring,
    turn: view.turn,
    bricks: view.bricks.map((b) => ({ ...b, dazed: false })),
    moves: { [me]: move },
    drops: {},
    events: [] as BrawlEvent[],
    roundPoints: {},
    placing: null,
  };
  const events = resolveTurn(round, {});
  return { bricks: round.bricks, events, ring: round.ring };
}
export type Simulation = ReturnType<typeof simulate>;

export interface Ghost {
  id: PlayerId;
  x: number;
  y: number;
  falls: boolean;
}

/** Where the previewed move would leave each brick it touches, compared with where they stand now. */
export function ghostsOf(sim: Simulation, bricks: BrawlBrick[], size: number): Ghost[] {
  return sim.bricks.flatMap((after) => {
    const now = bricks.find((b) => b.id === after.id);
    if (!now || now.outAt !== null) return [];
    if (after.x === now.x && after.y === now.y && after.outAt === null) return [];
    const falls = after.outAt !== null || !onArena({ size, ring: sim.ring }, after.x, after.y);
    return [{ id: after.id, x: after.x, y: after.y, falls }];
  });
}

/** Neighbors whose shove would send `me` off the arena from where it stands now. */
export function threats(view: BrickBrawlView, me: BrawlBrick): PlayerId[] {
  const ring = view.crumbles ? view.ring + 1 : view.ring;
  return view.bricks
    .filter((o) => o.outAt === null && o.id !== me.id)
    .filter((o) =>
      Object.values(DIRS).some(
        ([dx, dy]) =>
          o.x === me.x - dx &&
          o.y === me.y - dy &&
          !onArena({ size: view.size, ring }, me.x + 2 * dx, me.y + 2 * dy),
      ),
    )
    .map((o) => o.id);
}

/** The move a click on each tile makes for the picked move type, keyed `"x,y"`. */
export function tileMoves(
  mine: Pick<BrawlBrick, "x" | "y"> | null | undefined,
  picked: MoveType | null,
): Map<string, BrawlMove> {
  const moves = new Map<string, BrawlMove>();
  if (!mine || !picked || !needsDir(picked)) return moves;
  const reach = picked === "dash" ? 2 : 1;
  for (const dir of Object.keys(DIRS) as Dir[]) {
    const [dx, dy] = DIRS[dir];
    moves.set(`${mine.x + reach * dx},${mine.y + reach * dy}`, { type: picked, dir } as BrawlMove);
  }
  return moves;
}

/** Which beat of the replay each event belongs to: moves, then shoves, then dropped bricks, then the edge. */
export function stagesOf(events: BrawlEvent[]): BrawlEvent[][] {
  const stages: BrawlEvent[][] = [[], [], [], []];
  let stage = 0;
  for (const e of events) {
    if (e.kind === "shove") stage = Math.max(stage, 1);
    if (e.kind === "drop") stage = Math.max(stage, 2);
    if (e.kind === "shrink") stage = 3;
    stages[stage]!.push(e);
  }
  return stages;
}

/** When each beat of the replay starts, in ms from the start of the replay. */
export const STAGE_AT_MS = [150, 1000, 1850, 2600];

/** The beat showing `elapsed` ms into the replay, or -1 before the first. */
export function stageAt(elapsed: number): number {
  let stage = -1;
  STAGE_AT_MS.forEach((at, i) => {
    if (elapsed >= at) stage = i;
  });
  return stage;
}

export const SOUND: Partial<Record<BrawlEvent["kind"], SfxName>> = {
  block: "shield",
  bump: "bump",
  ram: "thud",
  shove: "thud",
  fall: "fall",
  drop: "drop",
  shrink: "crumble",
};

/** The sounds a beat makes, each once. */
export function stageSounds(events: BrawlEvent[]): SfxName[] {
  return [...new Set(events.flatMap((e) => (SOUND[e.kind] ? [SOUND[e.kind]!] : [])))];
}

/** Whether a beat shakes the arena. */
export const stageShakes = (events: BrawlEvent[]) =>
  events.some((e) => e.kind === "shove" || e.kind === "ram");

/**
 * Where every brick stands after each beat of the replay, starting from where they stood when moves were picked.
 * Bricks knocked out in a beat get `outAt`, and bricks hit by a dropped brick get `dazed`.
 */
export function replayFrames(before: BrawlBrick[], events: BrawlEvent[], turn: number): BrawlBrick[][] {
  let bricks = before.map((b) => ({ ...b }));
  return stagesOf(events).map((stage) => {
    bricks = bricks.map((b) => ({ ...b }));
    const find = (id: PlayerId) => bricks.find((b) => b.id === id);
    for (const e of stage) {
      if (e.kind === "move") Object.assign(find(e.id) ?? {}, { x: e.to[0], y: e.to[1] });
      if (e.kind === "fall") Object.assign(find(e.id) ?? {}, { outAt: turn });
      if (e.kind === "drop" && e.hit) Object.assign(find(e.hit) ?? {}, { dazed: true });
    }
    return bricks;
  });
}

/** How many rings have crumbled as far as the screen shows: during a replay the edge only falls in the last beat. */
export function ringShown(
  view: Pick<BrickBrawlView, "ring" | "events" | "phase">,
  stage: number | null,
): number {
  const shrinks = view.phase === "replay" && view.events.some((e) => e.kind === "shrink");
  return shrinks && (stage === null || stage < 3) ? view.ring - 1 : view.ring;
}

/** The mood a brick's face shows. */
export function moodOf(b: {
  out: boolean;
  dazed: boolean;
  hit: boolean;
  bumped: boolean;
  threatened: boolean;
}) {
  if (b.out) return "sad" as const;
  if (b.dazed) return "sleepy" as const;
  return b.hit || b.bumped || b.threatened ? ("wow" as const) : ("happy" as const);
}
