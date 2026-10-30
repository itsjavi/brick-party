import {
  CANVAS_UNITS,
  DRAW_COLORS,
  DRAW_SIZES,
  STROKE_PARTS,
  fillPathData,
  paintOrder,
  shapePathData,
  type Stroke,
  type StrokePart,
} from "./games/skip-logic";

/** A game's limits on one drawing. */
export interface DrawLimits {
  maxStrokes: number;
  maxValues: number;
}
/** Skip Logic's limits (`drawingSchema` in skip-logic.ts), the default. */
const SKIP_LOGIC_LIMITS: DrawLimits = { maxStrokes: 400, maxValues: 12000 };
/** Distance between sampled points, in canvas units. */
const STEP = 14;
/** How far a point may drift from the ideal line, so shapes look hand-drawn. */
const WOBBLE = 3;

export const COLOR_NAMES = ["ink", "white", "coral", "sun", "teal", "sky", "grape", "pink", "gray"] as const;
const SIZE_NAMES = ["thin", "medium", "thick", "huge"] as const;
const FILLABLE = ["rect", "circle", "ellipse", "triangle", "polygon"];

export const SHAPES_HELP = `Shapes, one per line or separated by ";". Canvas is ${CANVAS_UNITS}x${CANVAS_UNITS}, origin top left, y down.
  color ${COLOR_NAMES.join("|")}      size ${SIZE_NAMES.join("|")} (or 0-3)
  line x1 y1 x2 y2          poly x1 y1 x2 y2 ...       polygon x1 y1 x2 y2 ... (closed)
  rect x y w h              circle cx cy r             ellipse cx cy rx ry
  triangle x1 y1 x2 y2 x3 y3                           arc cx cy r from to (degrees, 0 = right, 90 = down)
  curve x1 y1 cx cy x2 y2   (quadratic)                dot x y
  fill rect|circle|ellipse|triangle|polygon ...        (solid, in the current color, under every line)
  part ${STROKE_PARTS.join("|")}   (Doodle Champions and Doodle Smash: the fighter part the next shapes belong to; starts as body)
  weapon blade|blaster      (Doodle Smash: what the fighter's weapon is; blade if left out)`;

const WEAPON_KINDS = ["blade", "blaster"] as const;

/** The weapon kind a fighter's shapes name with `weapon blade|blaster` (the last one counts), or `null` for none. */
export function shapesWeapon(source: string): (typeof WEAPON_KINDS)[number] | null {
  let kind: (typeof WEAPON_KINDS)[number] | null = null;
  for (const raw of source.split(/[;\n]/)) {
    const [word = "", name = ""] = raw.trim().split(/\s+/);
    if (word.toLowerCase() !== "weapon") continue;
    const k = name.toLowerCase() as (typeof WEAPON_KINDS)[number];
    if (!WEAPON_KINDS.includes(k)) throw new Error(`Unknown weapon "${name}". Weapons are ${WEAPON_KINDS.join(" and ")}.`);
    kind = k;
  }
  return kind;
}

type Point = [number, number];

const clamp = (n: number) => Math.max(0, Math.min(CANVAS_UNITS, Math.round(n)));

/** Points every `STEP` units along a path of straight segments. */
function resample(path: Point[]): Point[] {
  const out: Point[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP));
    for (let s = 1; s <= steps; s++) out.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  return out;
}

function arcPath(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Point[] {
  const span = to - from;
  const steps = Math.max(8, Math.ceil((Math.abs(span) / 360) * ((2 * Math.PI * Math.max(rx, ry)) / STEP)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + (span * i) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Point;
  });
}

function curvePath(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): Point[] {
  const steps = Math.max(8, Math.ceil((Math.hypot(cx - x1, cy - y1) + Math.hypot(x2 - cx, y2 - cy)) / STEP));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2] as Point;
  });
}

/** A solid fill of a closed outline: one ring that ends on its first point, as the game stores fills. */
function toFill(outline: Point[], color: number, size: number, part?: StrokePart): Stroke {
  const ring: Point[] = [];
  for (const [x, y] of outline) {
    const point: Point = [clamp(x), clamp(y)];
    const last = ring.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) ring.push(point);
  }
  if (ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1]) ring.pop();
  const fill: Stroke = { c: color, w: size, p: [...ring, ring[0]!].flat(), k: "fill" };
  return part ? { ...fill, t: part } : fill;
}

function toStroke(path: Point[], color: number, size: number, random: () => number, part?: StrokePart): Stroke {
  const p = resample(path).flatMap(([x, y]) => [clamp(x + (random() - 0.5) * 2 * WOBBLE), clamp(y + (random() - 0.5) * 2 * WOBBLE)]);
  const stroke: Stroke = { c: color, w: size, p: p.length >= 4 ? p : [...p, ...p] };
  return part ? { ...stroke, t: part } : stroke;
}

/** Thins out the points of a drawing that's over the game's limit, keeping every stroke. */
function fitLimits(strokes: Stroke[], limits: DrawLimits): Stroke[] {
  const kept = strokes.slice(0, limits.maxStrokes);
  const total = kept.reduce((n, s) => n + s.p.length, 0);
  if (total <= limits.maxValues) return kept;
  // Every stroke keeps its last point as well, so leave room for those.
  const keepEvery = Math.ceil(total / Math.max(1, limits.maxValues - 2 * kept.length));
  return kept.map((s) => {
    const points: number[] = [];
    for (let i = 0; i < s.p.length; i += 2 * keepEvery) points.push(s.p[i]!, s.p[i + 1]!);
    points.push(s.p.at(-2)!, s.p.at(-1)!);
    return { ...s, p: points };
  });
}

/**
 * Turns shape commands (see `SHAPES_HELP`) into game strokes. Throws with the bad line on a typo. Strokes carry a part
 * only once a `part` command names one.
 */
export function drawShapes(source: string, random: () => number = Math.random, limits: DrawLimits = SKIP_LOGIC_LIMITS): Stroke[] {
  let color = 0;
  let size = 1;
  let part: StrokePart | undefined;
  const strokes: Stroke[] = [];
  const add = (path: Point[], width = size) => strokes.push(toStroke(path, color, width, random, part));

  for (const raw of source.split(/[;\n]/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [word = "", ...rest] = line.split(/\s+/);
    const command = word.toLowerCase();
    const fill = command === "fill";
    const kind = fill ? (rest.shift() ?? "").toLowerCase() : command;
    const args = rest.map(Number);
    /** Outlines a closed shape, or fills it after `fill`. */
    const shape = (outline: Point[]) => (fill ? strokes.push(toFill(outline, color, size, part)) : add([...outline, outline[0]!]));
    const need = (n: number, even = false) => {
      if (args.length < n || args.some((a) => !Number.isFinite(a)) || (even && args.length % 2)) {
        throw new Error(`Can't read "${line}". ${SHAPES_HELP}`);
      }
    };

    if (command === "color") {
      const name = rest[0]?.toLowerCase() ?? "";
      const index = COLOR_NAMES.indexOf(name as (typeof COLOR_NAMES)[number]);
      color = index >= 0 ? index : Number(name);
      if (!Number.isInteger(color) || color < 0 || color >= DRAW_COLORS.length) throw new Error(`Unknown color "${rest[0]}".`);
      continue;
    }
    if (command === "part") {
      const name = (rest[0]?.toLowerCase() ?? "") as StrokePart;
      if (!STROKE_PARTS.includes(name)) throw new Error(`Unknown part "${rest[0]}". Parts are ${STROKE_PARTS.join(", ")}.`);
      part = name;
      continue;
    }
    if (command === "weapon") {
      // What the weapon is, not a shape: `shapesWeapon` reads it.
      shapesWeapon(line);
      continue;
    }
    if (command === "size") {
      const name = rest[0]?.toLowerCase() ?? "";
      const index = SIZE_NAMES.indexOf(name as (typeof SIZE_NAMES)[number]);
      size = index >= 0 ? index : Number(name);
      if (!Number.isInteger(size) || size < 0 || size >= DRAW_SIZES.length) throw new Error(`Unknown size "${rest[0]}".`);
      continue;
    }

    if (fill && !FILLABLE.includes(kind)) throw new Error(`Only closed shapes fill: ${FILLABLE.join(", ")}. ${SHAPES_HELP}`);
    switch (kind) {
      case "line":
        need(4);
        add([[args[0]!, args[1]!], [args[2]!, args[3]!]]);
        break;
      case "poly":
      case "polygon": {
        need(kind === "polygon" ? 6 : 4, true);
        const points = Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i]!, args[2 * i + 1]!] as Point);
        if (kind === "polygon") shape(points);
        else add(points);
        break;
      }
      case "triangle":
        need(6);
        shape([[args[0]!, args[1]!], [args[2]!, args[3]!], [args[4]!, args[5]!]]);
        break;
      case "rect": {
        need(4);
        const [x, y, w, h] = args as [number, number, number, number];
        shape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
        break;
      }
      case "circle":
      case "ellipse": {
        need(kind === "circle" ? 3 : 4);
        const [cx, cy, rx] = args as [number, number, number];
        const ry = kind === "circle" ? rx : args[3]!;
        shape(arcPath(cx, cy, rx, ry, 0, 360).slice(0, -1));
        break;
      }
      case "arc":
        need(5);
        add(arcPath(args[0]!, args[1]!, args[2]!, args[2]!, args[3]!, args[4]!));
        break;
      case "curve":
        need(6);
        add(curvePath(args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!));
        break;
      case "dot":
        need(2);
        add([[args[0]!, args[1]!], [args[0]! + 1, args[1]!]]);
        break;
      default:
        throw new Error(`Unknown shape "${word}". ${SHAPES_HELP}`);
    }
  }
  if (!strokes.length) throw new Error(`The drawing is empty. ${SHAPES_HELP}`);
  return fitLimits(strokes, limits);
}

/** A drawing as an SVG on white, the way the game shows it: fills under lines. */
export function strokesToSvg(strokes: Stroke[], px = 500): string {
  const lines = paintOrder(strokes).map((s) => {
    if (s.k === "fill") return `<path d="${fillPathData(s.p)}" fill="${DRAW_COLORS[s.c]}" fill-rule="evenodd"/>`;
    if (s.k === "shape") {
      return `<path d="${shapePathData(s.p)}" fill="none" stroke="${DRAW_COLORS[s.c]}" stroke-width="${DRAW_SIZES[s.w]}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const points = [];
    for (let i = 0; i + 1 < s.p.length; i += 2) points.push(`${s.p[i]},${s.p[i + 1]}`);
    return `<polyline points="${points.join(" ")}" fill="none" stroke="${DRAW_COLORS[s.c]}" stroke-width="${DRAW_SIZES[s.w]}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${CANVAS_UNITS} ${CANVAS_UNITS}"><rect width="100%" height="100%" fill="#fff"/>${lines.join("")}</svg>`;
}
