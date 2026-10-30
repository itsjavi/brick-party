import {
  DOODLE_LIMITS,
  drawShapes,
  shapesWeapon,
  strokeSchema,
  type Stroke,
  type WeaponKind,
} from "@brick/game";
import { z } from "zod";
import type { LocalStroke } from "../games/skip-logic/simplify";

/**
 * Drawings on the dev pages: kept in this browser only, moved in and out as JSON (the strokes the server stores), or
 * written as `brick shapes` commands like the bots and the CLI use.
 */

/** Where the dev pages keep their last drawings in localStorage. */
export const DEV_STORAGE = { sketch: "brick-dev:sketch", fighter: "brick-dev:fighter" } as const;

/** A fighter as the dev pages keep it: its strokes as the server would store them, and its Doodle Smash weapon. */
export interface DevFighter {
  strokes: Stroke[];
  weapon: WeaponKind;
}

const weaponSchema = z.enum(["blade", "blaster"]);
const strokesSchema = z.array(strokeSchema);
const drawingSchema = z.union([
  strokesSchema,
  z.object({ strokes: strokesSchema, weapon: weaponSchema.optional() }),
]);

/** A stored stroke back as an editable one, so a loaded drawing can be drawn on and undone like a fresh one. */
export function toLocal(s: Stroke): LocalStroke {
  const points: number[][] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) points.push([s.p[i]!, s.p[i + 1]!]);
  const local: LocalStroke = { c: s.c, w: s.w, points };
  if (s.k) local.k = s.k;
  if (s.t) local.t = s.t;
  return local;
}

/**
 * Reads a drawing pasted on a dev page: a JSON array of strokes, `{ strokes, weapon }`, or `brick shapes` commands
 * (see `SHAPES_HELP`). Throws with a message to show when it's none of those.
 */
export function parseDrawing(
  text: string,
  limits = DOODLE_LIMITS,
): { strokes: Stroke[]; weapon: WeaponKind | null } {
  const source = text.trim();
  if (!source) throw new Error("Paste a drawing first.");
  if (source.startsWith("[") || source.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(source);
    } catch (error) {
      throw new Error(`That isn't valid JSON: ${(error as Error).message}`);
    }
    const parsed = drawingSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Not a drawing: ${issue ? `${issue.path.join(".") || "top level"}: ${issue.message}` : "unknown shape"}`,
      );
    }
    return Array.isArray(parsed.data)
      ? { strokes: parsed.data, weapon: null }
      : { strokes: parsed.data.strokes, weapon: parsed.data.weapon ?? null };
  }
  const strokes = drawShapes(source, Math.random, limits);
  if (!strokes.length) throw new Error("Those shapes drew nothing.");
  return { strokes, weapon: shapesWeapon(source) };
}

/** A drawing as pretty-enough JSON: one stroke per line, so it stays readable and diffable. */
export function drawingJson(strokes: Stroke[], weapon?: WeaponKind): string {
  const lines = strokes.map((s) => `    ${JSON.stringify(s)}`).join(",\n");
  const list = strokes.length ? `[\n${lines}\n  ]` : "[]";
  return weapon ? `{\n  "weapon": "${weapon}",\n  "strokes": ${list}\n}` : list.replace(/^ {2}/gm, "");
}

/** Reads a value the dev pages saved, or `null` when there's none or storage is blocked. */
export function loadSaved(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Saves a value for the dev pages; storage that's blocked or full just doesn't keep it. */
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the drawing lives until the page closes.
  }
}

/** The fighter `/dev/draw` saved last, or `null`. */
export function savedFighter(): DevFighter | null {
  const parsed = z
    .object({ strokes: strokesSchema, weapon: weaponSchema })
    .safeParse(loadSaved(DEV_STORAGE.fighter));
  return parsed.success && parsed.data.strokes.length ? parsed.data : null;
}

/** The sketch `/dev/draw` saved last, or an empty one. */
export function savedSketch(): Stroke[] {
  const parsed = strokesSchema.safeParse(loadSaved(DEV_STORAGE.sketch));
  return parsed.success ? parsed.data : [];
}
