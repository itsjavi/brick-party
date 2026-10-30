/**
 * Hue Clue's board: a grid of colours with the hue running across (columns A to P) and lightness running down (rows 1
 * to 10, light to dark). The colours are worked out here, in OKLCH so steps look even, and both the room and the
 * screens use these same functions, so a cell is the same colour everywhere.
 */

export const HUE_COLS = 16;
export const HUE_ROWS = 10;
export const HUE_CELLS = HUE_COLS * HUE_ROWS;

/** Lightness of the top and bottom rows (OKLCH L). */
const TOP_L = 0.95;
const BOTTOM_L = 0.33;
/** The chroma each row asks for, top to bottom; colours the screen can't show get as much as fits. */
const ROW_C = [0.05, 0.1, 0.14, 0.17, 0.2, 0.21, 0.2, 0.18, 0.15, 0.12];
/** Each column's hue in degrees (OKLCH): red at A round the wheel to pink at P, with a true yellow at E. */
const COLUMN_HUES = [27, 47, 66, 85, 105, 125, 145, 165, 190, 215, 240, 264, 290, 315, 335, 355];

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

const bump = (hue: number, at: number, width: number) => Math.exp(-(((hue - at) / width) ** 2));

function oklabToLinear({ L, a, b }: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

const encode = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function toHex(rgb: number[]): string {
  return `#${rgb
    .map((v) =>
      Math.round(encode(v) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** The colour of one cell in OKLab, with its chroma cut back just enough to show on any screen. */
function cellLab(cell: number): Oklab {
  const x = cell % HUE_COLS;
  const y = Math.floor(cell / HUE_COLS);
  const hue = COLUMN_HUES[x]!;
  // Yellows stay light for longer and blues darken sooner, so every hue gets its brightest look in the middle rows.
  const curve = 1 + 1.2 * bump(hue, 105, 30) - 0.25 * bump(hue, 265, 45);
  const L = TOP_L - (TOP_L - BOTTOM_L) * (y / (HUE_ROWS - 1)) ** curve;
  const h = (hue * Math.PI) / 180;
  let lo = 0;
  let hi = ROW_C[y]!;
  if (!inGamut(oklabToLinear({ L, a: hi * Math.cos(h), b: hi * Math.sin(h) }))) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear({ L, a: mid * Math.cos(h), b: mid * Math.sin(h) }))) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  return { L, a: hi * Math.cos(h), b: hi * Math.sin(h) };
}

/** Every cell's colour in OKLab, by index. */
export const HUE_LAB: readonly Oklab[] = Array.from({ length: HUE_CELLS }, (_, i) => cellLab(i));
/** Every cell's colour as a CSS hex, by index (row by row, top left first). */
export const HUE_COLORS: readonly string[] = HUE_LAB.map((lab) => toHex(oklabToLinear(lab)));

/** A CSS hex colour in OKLab, for comparing colours the way eyes do. */
export function hexToOklab(hex: string): Oklab {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => decode(v / 255)) as [
    number,
    number,
    number,
  ];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export const labDistance = (p: Oklab, q: Oklab) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

/** The cell whose colour is closest to a CSS hex colour. */
export function nearestCell(hex: string): number {
  const lab = hexToOklab(hex);
  let best = 0;
  for (let i = 1; i < HUE_CELLS; i++)
    if (labDistance(HUE_LAB[i]!, lab) < labDistance(HUE_LAB[best]!, lab)) best = i;
  return best;
}

export const cellX = (cell: number) => cell % HUE_COLS;
export const cellY = (cell: number) => Math.floor(cell / HUE_COLS);
export const cellAt = (x: number, y: number) =>
  Math.min(HUE_ROWS - 1, Math.max(0, y)) * HUE_COLS + Math.min(HUE_COLS - 1, Math.max(0, x));

/** Rings between two cells: 0 on the cell, 1 on the eight around it, 2 on the next square out, and so on. */
export function ringDistance(a: number, b: number): number {
  return Math.max(Math.abs(cellX(a) - cellX(b)), Math.abs(cellY(a) - cellY(b)));
}

export const HUE_COLUMN_LETTERS = "ABCDEFGHIJKLMNOP";

/** A cell's board label: its column letter and row number, like "F4". */
export function cellLabel(cell: number): string {
  return `${HUE_COLUMN_LETTERS[cellX(cell)]}${cellY(cell) + 1}`;
}

/** A board label like "F4" (any case) as a cell index, or `null` when it isn't one. */
export function parseCell(label: string): number | null {
  const match = /^\s*([a-p])\s*(10|[1-9])\s*$/i.exec(label);
  if (!match) return null;
  return (Number(match[2]) - 1) * HUE_COLS + HUE_COLUMN_LETTERS.indexOf(match[1]!.toUpperCase());
}

/** The hue family of each column, in plain words. */
export const HUE_COLUMN_NAMES = [
  "red",
  "orange-red",
  "orange",
  "golden",
  "yellow",
  "lime green",
  "green",
  "emerald green",
  "turquoise",
  "aqua",
  "sky blue",
  "blue",
  "blue-violet",
  "purple",
  "magenta",
  "pink",
];
export const HUE_ROW_NAMES = [
  "very pale",
  "pale",
  "light",
  "soft",
  "bright",
  "vivid",
  "rich",
  "deep",
  "dark",
  "very dark",
];

/** A rough plain description of a cell's colour, like "deep orange-red", for players who can't see the board. */
export function describeCell(cell: number): string {
  return `${HUE_ROW_NAMES[cellY(cell)]} ${HUE_COLUMN_NAMES[cellX(cell)]}`;
}
