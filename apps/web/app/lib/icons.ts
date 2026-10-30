import type { GameId, TrapId } from "@brick/game";

/**
 * Brick Party's own icons, in the Toybox style: flat fills, a thick ink outline and round joins, like the bricks.
 * Each icon is a list of SVG paths on a 32×32 grid, drawn in order. The same data renders as inline SVG
 * (`ui/Icon.stsx`) and on the fight canvases (`drawIcon`), so the art matches everywhere.
 */

const INK = "#1b1f3b";
const PAPER = "#ffffff";
const MIST = "#e6f7ff";
const SKY = "#3aaefc";
const TEAL = "#00c4b8";
const CORAL = "#ff5a4e";
const SUN = "#ffcc33";
const SUN_SOFT = "#ffe7a3";
const GRAPE = "#8b6cff";
const LIME = "#5fd068";
const ROSE = "#ff7ab6";
const SLATE = "#94a3b8";
const SKIN = "#ffd3a3";

/** How thick the ink outline is, in grid units. */
export const ICON_OUTLINE = 2.4;

export type IconPart =
  /** A filled shape with an ink outline, or without one when `bare`. */
  | { d: string; fill: string; bare?: boolean }
  /** An ink line `w` units wide. */
  | { d: string; line: number }
  /** A thick coloured stroke with an ink outline, for handles, limbs and arcs. */
  | { d: string; band: string; w: number };

const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
/** A star with `n` points, its first point straight up. */
const star = (cx: number, cy: number, n: number, outer: number, inner: number) => {
  const points = Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
};

const fill = (d: string, color: string): IconPart => ({ d, fill: color });
const bare = (d: string, color: string): IconPart => ({ d, fill: color, bare: true });
const ink = (d: string): IconPart => ({ d, fill: INK, bare: true });
const line = (d: string, w = ICON_OUTLINE): IconPart => ({ d, line: w });
const band = (d: string, color: string, w: number): IconPart => ({ d, band: color, w });

const HEART =
  "M16 27.5C6.5 21 3 15.5 3 11c0-3.8 2.8-6.5 6.2-6.5 3 0 5.3 1.8 6.8 4.3 1.5-2.5 3.8-4.3 6.8-4.3 3.4 0 6.2 2.7 6.2 6.5 0 4.5-3.5 10-13 16.5Z";
const BRICK = [
  fill(rect(6.5, 7, 7, 6, 2), CORAL),
  fill(rect(18.5, 7, 7, 6, 2), CORAL),
  fill(rect(3.5, 11, 25, 16, 4), CORAL),
  bare(rect(5.5, 22, 21, 3, 1.5), "rgba(0,0,0,0.14)"),
];
const HAND = [
  fill(rect(8.4, 6, 3.8, 12, 1.9), SKIN),
  fill(rect(12.4, 3, 3.8, 14, 1.9), SKIN),
  fill(rect(16.4, 3.5, 3.8, 14, 1.9), SKIN),
  fill(rect(20.4, 6.5, 3.8, 12, 1.9), SKIN),
  fill("M9.5 20c-2.5-2.5-6-3-6-.5 0 2.2 3.5 5 6 7.5Z", SKIN),
  fill(rect(8.4, 14, 15.8, 15, 6), SKIN),
];
const SWORD = [
  band("M9 23L25 7", MIST, 3.6),
  band("M5.5 19.5L12.5 26.5", SUN, 2.6),
  band("M8.5 23.5L4.5 27.5", CORAL, 3),
];
const TARGET = [
  fill(circle(15, 17, 12.5), CORAL),
  fill(circle(15, 17, 8), PAPER),
  fill(circle(15, 17, 3.6), CORAL),
];
const FACE = fill(circle(16, 16, 13), SUN);

export const ICONS = {
  // Games.
  feedback: [
    fill(rect(6, 5, 20, 24, 3), PAPER),
    fill(rect(11, 2.5, 10, 5, 2), SKY),
    line("M10.5 13h11M10.5 18h11M10.5 23h6"),
    band("M20 23.5l3.5 3.5M23.5 23.5L20 27", CORAL, 1.6),
  ],
  robot: [
    line("M16 9.5V5.5"),
    fill(circle(16, 5, 2.4), CORAL),
    fill(rect(3.5, 15, 4, 7, 1.5), SLATE),
    fill(rect(24.5, 15, 4, 7, 1.5), SLATE),
    fill(rect(6.5, 9.5, 19, 17, 5), TEAL),
    fill(rect(10, 13.5, 12, 6.5, 3.2), PAPER),
    ink(circle(13.3, 16.7, 1.8)),
    ink(circle(18.7, 16.7, 1.8)),
    line("M12.5 23h7"),
  ],
  chart: [
    fill(rect(4.5, 16, 6.5, 12, 1.5), SKY),
    fill(rect(12.75, 6, 6.5, 22, 1.5), SUN),
    fill(rect(21, 11, 6.5, 17, 1.5), CORAL),
    line("M2.5 28.5h27"),
  ],
  palette: [
    fill(
      "M16 3.5C8.5 3.5 3 9 3 15.5S8 28 14 28c2.2 0 3.2-1.2 3.2-2.7 0-1.6-1.2-2.2-1.2-3.6 0-1.6 1.3-2.4 3-2.4h3.6c4 0 6.4-2.8 6.4-6.6 0-5.8-5.6-9.2-13-9.2Z",
      SUN_SOFT,
    ),
    fill(circle(9.5, 13, 2.4), CORAL),
    fill(circle(15, 8.8, 2.4), SKY),
    fill(circle(21.5, 10.5, 2.4), LIME),
    fill(circle(9.5, 20.5, 2.4), GRAPE),
  ],
  brush: [
    band("M27 5L17.5 14.5", SUN, 3.6),
    fill("M15.4 13.3l3.3 3.3-2.3 2.3-3.3-3.3Z", SLATE),
    fill("M13.5 16l2.5 2.5c-.6 5.3-4.4 8.5-11 8.5 0-6.6 3.2-10.4 8.5-11Z", GRAPE),
  ],
  glove: [
    fill(rect(9.5, 22, 14, 7.5, 2.5), PAPER),
    fill("M10 23c-3.5-2.5-5-5.6-5-9.6C5 7.6 9.5 3.5 16 3.5S27.5 7.6 27.5 13.4c0 4-1.6 7.1-4.5 9.6Z", CORAL),
    line("M9.5 15.5c2-1.6 5.5-1.6 7 .8"),
    bare(ellipse(20.5, 9, 3.2, 2), "rgba(255,255,255,0.45)"),
  ],
  swords: [
    band("M7 6L21 20", MIST, 3.4),
    band("M25 6L11 20", MIST, 3.4),
    band("M18 23L24 17", SUN, 2.4),
    band("M8 17L14 23", SUN, 2.4),
    band("M21.5 21.5L26.5 26.5", CORAL, 3),
    band("M10.5 21.5L5.5 26.5", CORAL, 3),
  ],
  burst: [fill(star(16, 16.5, 9, 14.5, 7.5), SUN), fill(star(16, 16.5, 7, 7.5, 3.8), CORAL)],
  numbers: [
    fill(rect(2.5, 6.5, 27, 19, 4), PAPER),
    line("M7 12.5l2.2-1.6v10.6", 2.2),
    line("M13 13.3c.4-2.4 5-2.6 5 .3 0 2.6-5 4.4-5 7.9h5.4", 2.2),
    line("M21.3 11h5l-2.8 3.8c2.2 0 3.2 1.3 3.2 3.1s-1.5 3.3-3.3 3.3c-1.4 0-2.4-.6-2.9-1.5", 2.2),
  ],
  rainbow: [
    band("M4 25a12 12 0 0 1 24 0", CORAL, 3.4),
    band("M9 25a7 7 0 0 1 14 0", SUN, 3.4),
    band("M14 25a2 2 0 0 1 4 0", SKY, 3.4),
  ],
  bucket: [
    line("M6.5 12c0-9.5 19-9.5 19 0"),
    fill("M5.5 12h21l-2.5 16H8Z", SKY),
    fill(ellipse(16, 12, 10.5, 3.4), CORAL),
    fill("M18.5 13.2c0 4 .2 7 2 7s2-3 2-7.4Z", CORAL),
  ],

  // Things to click and things that happen.
  dice: [
    fill(rect(4.5, 4.5, 23, 23, 6), PAPER),
    ink(circle(10.5, 10.5, 2.2)),
    ink(circle(21.5, 10.5, 2.2)),
    ink(circle(16, 16, 2.2)),
    ink(circle(10.5, 21.5, 2.2)),
    ink(circle(21.5, 21.5, 2.2)),
  ],
  pencil: [
    fill("M21.5 4.5l6 6-15 15-6-6Z", SUN),
    fill("M6.5 19.5l6 6-8.5 2.5Z", SUN_SOFT),
    ink("M5 24.4l2.6 2.6-3.6 1Z"),
    fill("M21.5 4.5l6 6 1.6-1.6c1-1 1-2.5 0-3.5L26.6 2.9c-1-1-2.5-1-3.5 0Z", ROSE),
  ],
  brick: BRICK,
  drop: [
    line("M9 2.5v4M16 1.5v5M23 2.5v4", 2),
    fill(rect(7.5, 10, 6, 5, 2), CORAL),
    fill(rect(18.5, 10, 6, 5, 2), CORAL),
    fill(rect(4.5, 13.5, 23, 15, 4), CORAL),
  ],
  speaker: [
    fill("M4 12h5.5L17 5.5v21L9.5 20H4Z", SKY),
    line("M21 11.5c2 3 2 6 0 9"),
    line("M25 8c4 4.8 4 11.2 0 16"),
  ],
  trophy: [
    line("M9 8.5H5.5c0 5 2.2 6.8 5 7"),
    line("M23 8.5h3.5c0 5-2.2 6.8-5 7"),
    fill(rect(13.5, 18, 5, 6, 1), SUN),
    fill("M8.5 4.5h15V12c0 5.2-3.4 8.5-7.5 8.5S8.5 17.2 8.5 12Z", SUN),
    fill(rect(9.5, 23.5, 13, 5, 2), CORAL),
    bare(rect(11.5, 7, 3, 8, 1.5), "rgba(255,255,255,0.55)"),
  ],
  sword: SWORD,
  blaster: [
    fill("M8 17.5h6.5l-2 10H7.5Z", GRAPE),
    fill(rect(23, 11.5, 6.5, 6, 2), SUN),
    fill("M3.5 10h17c2.8 0 4.5 1.8 4.5 4.3s-1.7 4.2-4.5 4.2h-17Z", TEAL),
    line("M10.5 10v8.5M14.5 10v8.5", 2),
  ],
  fist: [
    fill(rect(5.5, 7, 21, 18, 7), SKIN),
    line("M11.5 7.5v5.5M16 7v6M20.5 7.5v5.5", 2),
    fill("M5.5 16.5h7c2 0 3 1.3 3 3s-1 3-3 3H8Z", SKIN),
  ],
  star: [fill(star(16, 17, 5, 14, 6), SUN)],
  heart: [fill(HEART, CORAL), bare(ellipse(9.5, 10.5, 2, 2.6), "rgba(255,255,255,0.5)")],
  heartEmpty: [fill(HEART, SLATE)],
  heartBroken: [fill(HEART, CORAL), line("M16.2 8.8l-3 5.2 4.2 3-3 5.5", 2.2)],
  lock: [
    band("M10.5 14.5V10a5.5 5.5 0 0 1 11 0v4.5", SLATE, 3),
    fill(rect(5.5, 14, 21, 15, 4), SUN),
    ink(circle(16, 20, 2.2)),
    ink("M14.8 21h2.4l.6 4.2h-3.6Z"),
  ],
  pin: [
    fill("M16 29.5C10 21.5 6.5 17 6.5 12a9.5 9.5 0 0 1 19 0c0 5-3.5 9.5-9.5 17.5Z", CORAL),
    fill(circle(16, 12, 3.4), PAPER),
  ],
  crown: [
    fill("M3.5 25.5V10l7 6 5.5-10 5.5 10 7-6v15.5Z", SUN),
    fill(circle(16, 19.5, 2.4), CORAL),
    ink(circle(3.5, 9, 1.6)),
    ink(circle(28.5, 9, 1.6)),
    ink(circle(16, 5, 1.6)),
  ],
  steps: [
    ink(ellipse(10.5, 21.5, 3.6, 5.6)),
    ink(circle(7.9, 13.6, 1.3)),
    ink(circle(10.6, 12.9, 1.3)),
    ink(circle(13.2, 13.9, 1.2)),
    ink(ellipse(21.5, 11, 3.6, 5.6)),
    ink(circle(18.9, 3.4, 1.3)),
    ink(circle(21.6, 2.7, 1.3)),
    ink(circle(24.2, 3.7, 1.2)),
  ],
  dash: [line("M3 10h10M1.5 16h14M3 22h10", 2.6), band("M19 8l8 8-8 8", SKY, 3.6)],
  shield: [
    fill("M16 3l11 4v8.5C27 22.5 22 27 16 29 10 27 5 22.5 5 15.5V7Z", SKY),
    bare("M16 4.6V15.5h9.4c-.4 5.6-4.4 9.6-9.4 11.6Z", "rgba(255,255,255,0.35)"),
    fill(star(16, 15.5, 5, 6, 2.6), SUN),
  ],
  hand: HAND,
  warning: [fill("M16 3.5L29.5 27h-27Z", SUN), line("M16 11.5v7.5", 3), ink(circle(16, 23, 1.9))],
  dizzy: [
    band("M16 16a1.5 1.5 0 0 1 3 0a3 3 0 0 1-6 0a4.5 4.5 0 0 1 9 0a6 6 0 0 1-12 0", SUN, 2),
    fill(star(25.5, 6.5, 4, 5, 2), SUN),
    fill(star(6, 24.5, 4, 4, 1.6), SUN),
  ],
  bolt: [fill("M18.5 2.5L6.5 18h8.5l-2.5 11.5L25.5 13h-8.5Z", SUN)],
  mic: [
    line("M7 14.5c0 5.2 4 8.5 9 8.5s9-3.3 9-8.5"),
    line("M16 23v5M11 28.5h10"),
    fill(rect(11, 2.5, 10, 16, 5), SLATE),
    line("M11.5 8h4M11.5 12h4", 1.8),
  ],
  body: [
    fill(ellipse(16, 17, 12, 10.5), LIME),
    ink(circle(12, 14.5, 1.9)),
    ink(circle(20, 14.5, 1.9)),
    line("M13 20c1.8 1.5 4.2 1.5 6 0", 2),
  ],
  leg: [
    band("M10 3.5c3 5 5 8.5 5 12.5s-1.5 5-2 7", SKIN, 5.5),
    fill("M8.5 21.5h6.5c4 0 8 2 8 5.5v1H8.5Z", CORAL),
    line("M8.5 25.5h14.5", 1.6),
  ],
  arm: [
    band("M4 24H17.5L21.5 12", SKIN, 6),
    fill(circle(22.5, 8, 4.8), SKIN),
    bare("M5.5 22c1.2-6.5 11-7 12.5-.5Z", SKIN),
    line("M5.5 21.5c1.2-6.5 11-7 12.5-.5", ICON_OUTLINE),
  ],

  // Awards.
  megaphone: [
    fill("M9 19l2 8h3.5l-1.5-8Z", GRAPE),
    fill(rect(3, 11.5, 7, 9, 2), SLATE),
    fill("M9 11.5l14-7v23l-14-7Z", CORAL),
    fill(ellipse(23.5, 16, 3.5, 11.5), SUN),
  ],
  magnifier: [
    band("M19.5 19.5L27 27", CORAL, 4.2),
    fill(circle(13, 13, 9), MIST),
    bare(ellipse(10, 10, 2.4, 3), PAPER),
  ],
  grimace: [
    FACE,
    ink(circle(11.5, 12, 1.9)),
    ink(circle(20.5, 12, 1.9)),
    fill(rect(8.5, 17.5, 15, 7, 2.5), PAPER),
    line("M8.5 21h15M13.5 17.5v7M18.5 17.5v7", 1.6),
  ],
  crystal: [
    fill("M7.5 28.5l2.5-6h12l2.5 6Z", SUN),
    fill(circle(16, 13.5, 10.5), GRAPE),
    bare(ellipse(12, 9.5, 2.5, 3.5), "rgba(255,255,255,0.55)"),
    bare(star(20, 16, 4, 3.4, 1.2), PAPER),
  ],
  outlier: [
    line("M4.5 3.5v24h24"),
    ink(circle(9.5, 22, 1.8)),
    ink(circle(13, 19.5, 1.8)),
    ink(circle(10.5, 17, 1.8)),
    ink(circle(15, 23, 1.8)),
    ink(circle(14.5, 15.5, 1.8)),
    fill(circle(24, 8.5, 3.6), CORAL),
  ],
  eyes: [
    fill(ellipse(10.5, 16, 6.5, 9), PAPER),
    fill(ellipse(21.5, 16, 6.5, 9), PAPER),
    ink(circle(13, 17.5, 3)),
    ink(circle(24, 17.5, 3)),
  ],
  target: TARGET,
  bullseye: [...TARGET, line("M15 17L27 5", 2.4), band("M24 4.5l2.5 2.5M26.5 3l2.5 2.5", CORAL, 1.4)],
  cans: [
    line("M9.5 17c4 5 9-4 13 0", 1.6),
    fill(rect(2.5, 11, 8, 12, 2), SKY),
    fill(rect(21.5, 11, 8, 12, 2), SKY),
    line("M2.5 14.5h8M21.5 14.5h8", 1.6),
  ],
  frame: [
    fill(rect(3.5, 4.5, 25, 23, 2.5), SUN),
    fill(rect(7.5, 8.5, 17, 15, 1), MIST),
    bare("M7.5 23.5l6-7 4 4 3-3 4 6Z", LIME),
    bare(circle(19.5, 12.5, 2), CORAL),
    line("M7.5 23.5l6-7 4 4 3-3 4 6", 1.6),
  ],
  monocle: [
    FACE,
    ink(circle(11, 13.5, 1.9)),
    line("M17 9l6.5-1", 1.8),
    fill(circle(20.5, 14, 4.2), "rgba(230,247,255,0.8)"),
    ink(circle(20.5, 14, 1.6)),
    line("M24.2 16.5c1.8 4 1 7.5-1.5 10", 1.4),
    line("M11.5 22h7", 2),
  ],
  bulldozer: [
    fill("M2.5 14.5h5v12h-5Z", SLATE),
    line("M7.5 17.5h4", 2.4),
    fill(rect(10.5, 5.5, 13, 14, 2.5), SUN),
    fill(rect(13.5, 8, 7, 5.5, 1), MIST),
    fill(rect(7.5, 19.5, 22, 8.5, 4.25), SLATE),
    ink(circle(12, 23.75, 1.7)),
    ink(circle(18.5, 23.75, 1.7)),
    ink(circle(25, 23.75, 1.7)),
  ],
  parachute: [
    line("M4 15l9.5 9.5M28 15l-9.5 9.5M16 15v9", 1.4),
    fill(
      "M3 15C3 7.5 9 3 16 3s13 4.5 13 12c-1.8-1.8-4.7-1.8-6.5 0-1.8-1.8-4.7-1.8-6.5 0-1.8-1.8-4.7-1.8-6.5 0-1.8-1.8-4.7-1.8-6.5 0Z",
      CORAL,
    ),
    line("M9.5 14.5C9.5 9 12 4.5 16 3.5M22.5 14.5C22.5 9 20 4.5 16 3.5", 1.6),
    fill(rect(11.5, 23.5, 9, 6.5, 2), SUN),
  ],
  sneaker: [
    line("M4 9h6M2 13h6", 2),
    fill("M4.5 24c0-4 .8-9 2.5-12.5h6c1.2 3 4.4 4.8 9 5.8 4.2.9 6.5 2.9 6.5 6.7Z", CORAL),
    fill(rect(3.5, 23, 26, 5, 2.5), PAPER),
    line("M14 14.5l2.5-1.5M16.5 16.5L19 15", 1.6),
  ],
  hourglass: [
    fill("M9 6.5h14c0 5.5-5 7.3-5 9.5s5 4 5 9.5H9c0-5.5 5-7.3 5-9.5S9 12 9 6.5Z", MIST),
    bare("M11.2 25h9.6c-.6-2.6-3-4-4.8-4s-4.2 1.4-4.8 4Z", SUN),
    bare("M12 10.5h8c-1 1.5-3 2.5-4 3.5-1-1-3-2-4-3.5Z", SUN),
    fill(rect(5.5, 3, 21, 4.5, 2), CORAL),
    fill(rect(5.5, 24.5, 21, 4.5, 2), CORAL),
  ],
  noHands: [
    ...HAND,
    band("M16 3a13 13 0 1 1 0 26a13 13 0 1 1 0-26", CORAL, 2.4),
    band("M7 7L25 25", CORAL, 2.4),
  ],
  noodles: [
    band("M19 12.5L28 3", SUN_SOFT, 1.8),
    band("M22.5 13L30 6.5", SUN_SOFT, 1.8),
    line("M9 14c0-3.5 2-4 2-7M13.5 14c0-3.5 2-4 2-7M18 14c0-3 1.5-4 1.5-6", 2),
    fill("M3.5 14h25c0 7.5-5.5 13.5-12.5 13.5S3.5 21.5 3.5 14Z", CORAL),
    line("M8 19.5h16", 1.6),
  ],
  coins: [
    fill("M6 21v3.5c0 2.2 4.5 4 10 4s10-1.8 10-4V21Z", SUN),
    fill(ellipse(16, 21, 10, 4), SUN),
    fill("M6 14.5V18c0 2.2 4.5 4 10 4s10-1.8 10-4v-3.5Z", SUN),
    fill(ellipse(16, 14.5, 10, 4), SUN),
    fill("M6 8v3.5c0 2.2 4.5 4 10 4s10-1.8 10-4V8Z", SUN),
    fill(ellipse(16, 8, 10, 4), SUN),
    line("M11 8h10", 1.8),
  ],
  hat: [
    fill("M8.5 19.5c0-6 1.5-12.5 4.5-12.5 1.3 0 2 1 3 1s1.7-1 3-1c3 0 4.5 6.5 4.5 12.5Z", SUN),
    band("M9 16.5h14", CORAL, 2.4),
    fill("M2 19c4 4.5 24 4.5 28 0-1.5-1.5-4-1-7-.5-4 .7-10 .7-14 0-3-.5-5.5-1-7 .5Z", SUN),
  ],
  speech: [
    fill(
      "M6 4.5h20a3.5 3.5 0 0 1 3.5 3.5v11.5a3.5 3.5 0 0 1-3.5 3.5H14l-6.5 6v-6H6a3.5 3.5 0 0 1-3.5-3.5V8A3.5 3.5 0 0 1 6 4.5Z",
      PAPER,
    ),
    fill(circle(10, 13.75, 2.4), CORAL),
    fill(circle(16, 13.75, 2.4), SUN),
    fill(circle(22, 13.75, 2.4), SKY),
  ],
  compass: [
    fill(circle(16, 16, 13), PAPER),
    fill("M16 5.5l4 10.5h-8Z", CORAL),
    fill("M16 26.5L12 16h8Z", SLATE),
    ink(circle(16, 16, 1.8)),
  ],
  shootingStar: [line("M2.5 21l8-6M5 27.5l9-7.5M10.5 29.5l6-5.5", 2.4), fill(star(20, 12, 5, 9.5, 4), SUN)],
  boomerang: [
    fill(
      "M4.5 25.5L12 5.8c.7-1.8 3.3-2 4.3-.4L18 8.4 12.2 21H25c1.8 0 2.9 1.9 2 3.5l-1 1.6c-.6 1-1.6 1.4-2.7 1.4H5.8c-1 0-1.7-.6-1.3-1Z",
      SUN,
    ),
    line("M8.5 23.5L14.5 8", 1.4),
  ],
  battery: [
    fill(rect(26, 12.5, 3.5, 7, 1.2), SLATE),
    fill(rect(2.5, 8.5, 24, 15, 3.5), PAPER),
    bare(rect(5.5, 11.5, 18, 9, 1.5), LIME),
    fill("M16 11l-5 6h4l-1.5 4 5-6h-4Z", SUN),
  ],
  melting: [
    fill(ellipse(16, 28, 12.5, 2.2), SUN),
    fill(
      "M4.5 15a11.5 11.5 0 0 1 23 0v7.5c0 2-2.5 2-2.5 0V20c0-1.5-2.5-1.5-2.5 0v5.5c0 2-3 2-3 0v-3c0-1.5-2.5-1.5-2.5 0v1c0 2-3 2-3 0V20c0-1.5-2.5-1.5-2.5 0v2.5c0 2-2.5 2-2.5 0Z",
      SUN,
    ),
    ink(circle(11.5, 12.5, 1.9)),
    ink(circle(20.5, 13.5, 1.9)),
    line("M10.5 18.5c2-1.5 3.5 1 5.5 0s3.5-1.5 5.5 0", 1.8),
  ],
  wilted: [
    band("M13 29.5c0-9 1-13.5 6-16.5", LIME, 2.2),
    fill("M14.5 21.5c-4-1-6-3.5-6-6.5 3.5 0 6 2.5 6 6.5Z", LIME),
    fill(circle(22, 11.5, 6), CORAL),
    line("M20 11a2.2 2.2 0 1 1 4 1.2", 1.6),
    fill(ellipse(8.5, 6.5, 2.6, 1.6), CORAL),
  ],
  chartDown: [
    line("M4.5 3.5v24h24"),
    band("M7 9l6 6.5 4.5-3.5 7.5 9", CORAL, 2.6),
    fill("M27.5 24.5l-7.5-.8 5.6-5.8Z", CORAL),
  ],
  house: [
    fill(rect(7, 14, 18, 14, 1.5), SUN_SOFT),
    fill("M3 16L16 4.5 29 16Z", CORAL),
    fill(rect(13.5, 19.5, 5, 8.5, 1), SKY),
  ],
  // Make It Worse: a survey card scribbled over, and one icon per trap.
  worseForm: [
    fill(rect(5, 3, 22, 26, 3.5), PAPER),
    line("M9 9h9M9 14h14M9 19h11", 1.8),
    band("M8 25c3-4 5 1 8-2s4 1 8-3", CORAL, 1.4),
    fill("M21 3.5l2.5-3 1 4M27 7.5l3.5-1.5-1.5 3.6", CORAL),
  ],
  runaway: [
    line("M11 21l-3 5M18 21l3 5"),
    fill(rect(4, 8, 19, 13, 4), SUN),
    bare(rect(6, 16.5, 15, 2.5, 1.2), "rgba(0,0,0,0.14)"),
    line("M9 13.5h9"),
    line("M26 9.5h3M27 14.5h3M26 19.5h3", 2),
  ],
  popups: [
    fill(rect(11, 3, 18, 14, 2.5), PAPER),
    fill(rect(7, 8, 18, 14, 2.5), PAPER),
    fill(rect(3, 13, 19, 15, 2.5), PAPER),
    fill(rect(3, 13, 19, 5, 2.5), CORAL),
    line("M16 14.3l2.4 2.4M18.4 14.3L16 16.7", 1.8),
    line("M7 22h10M7 25h6", 1.8),
  ],
  tabMaze: [
    fill(rect(3, 6, 26, 20, 4), PAPER),
    bare(rect(5.5, 20.5, 21, 3, 1.5), "rgba(0,0,0,0.14)"),
    line("M8 17l4-6 4 7 4-7 3.5 5"),
    line("M21 15.5l2.5.5.4-2.6", 2),
  ],
  captcha: [
    fill(rect(4, 4, 24, 24, 3), PAPER),
    bare(rect(12.6, 12.6, 6.8, 6.8), SKY),
    line("M12 4.5v23M20 4.5v23M4.5 12h23M4.5 20h23", 1.6),
    line("M14.4 14.6a1.7 1.7 0 1 1 2.4 1.6c-.6.3-.8.6-.8 1.2", 1.5),
    ink(circle(16, 18.6, 0.8)),
  ],
  terms: [
    fill(rect(7, 2.5, 18, 27, 3), PAPER),
    line("M11 8h10M11 12h10M11 16h10M11 20h10M11 24h5", 1.8),
    band("M28.5 6v19", SLATE, 2),
    fill(rect(26.5, 19, 4, 6, 2), GRAPE),
  ],
  disguised: [
    fill(rect(3, 9, 26, 15, 5.5), CORAL),
    bare(rect(5.5, 19.5, 21, 3, 1.5), "rgba(0,0,0,0.14)"),
    ink(
      "M6.5 13.5c3.2-2 6.4-1.2 9.5.5 3.1-1.7 6.3-2.5 9.5-.5 0 4.2-3 5.4-5.6 4.4-1.6-.6-2.6-1.6-3.9-1.6s-2.3 1-3.9 1.6C9.5 18.9 6.5 17.7 6.5 13.5Z",
    ),
    bare(circle(11.6, 14.8, 1.5), PAPER),
    bare(circle(20.4, 14.8, 1.5), PAPER),
  ],
  bigYes: [
    fill(rect(3, 4, 26, 15, 5), LIME),
    bare(rect(5.5, 14.5, 21, 3, 1.5), "rgba(0,0,0,0.14)"),
    line("M11 11.5l3.3 3.2 6.7-6.7", 3),
    fill(rect(12, 23, 8, 4.5, 2), SLATE),
  ],
  backwards: [
    fill(rect(4, 11, 5, 17, 1.5), SKY),
    fill(rect(10.5, 15, 5, 13, 1.5), SKY),
    fill(rect(17, 19, 5, 9, 1.5), SKY),
    fill(rect(23.5, 23, 5, 5, 1.5), SKY),
    line("M26 6H8"),
    line("M11 3L8 6l3 3"),
  ],
  doubleNegative: [
    fill(rect(5, 5, 22, 22, 4.5), PAPER),
    line("M10 16.5l4.2 4 8-9.5", 3.2),
    band("M8 24L24 8", CORAL, 2.6),
  ],
  ghost: [
    fill("M7 28V14.5a9 9 0 0 1 18 0V28l-3-2.6-3 2.6-3-2.6-3 2.6-3-2.6Z", MIST),
    ink(ellipse(12.8, 15, 1.5, 2.1)),
    ink(ellipse(19.2, 15, 1.5, 2.1)),
  ],
  slider: [
    band("M4 16h24", SLATE, 3.2),
    band("M4 16h10", TEAL, 3.2),
    fill(circle(14, 16, 4.6), SUN),
    line("M8 9v2M14 9v2M20 9v2M26 9v2", 1.6),
  ],
  tinyTarget: [band("M19.5 19.5l7 7", GRAPE, 3.4), fill(circle(13, 13, 8.5), MIST), ink(circle(13, 13, 1.4))],
  gavel: [
    fill(rect(3, 25, 16, 4, 1.5), SLATE),
    band("M14 15l12 12", SUN_SOFT, 3),
    fill("M5.5 12.5l9-9 6 6-9 9Z", SUN),
    line("M9 9l6 6", 1.6),
  ],
  card: [
    fill(rect(3, 7, 26, 18, 3), GRAPE),
    bare(rect(3, 11.5, 26, 3.5), INK),
    fill(rect(7, 18.5, 7, 3, 1), SUN),
    line("M18 20h7", 1.8),
  ],
} satisfies Record<string, IconPart[]>;

export type IconName = keyof typeof ICONS;

/** Each game's icon, for its card, intro and rules. */
export const GAME_ICON: Record<GameId, IconName> = {
  "worst-feedback": "feedback",
  "bot-or-not": "robot",
  "survey-says": "chart",
  "skip-logic": "palette",
  "fake-artist": "brush",
  "brick-brawl": "glove",
  "doodle-champions": "swords",
  "doodle-smash": "burst",
  "in-order": "numbers",
  "hue-clue": "rainbow",
  "paint-grab": "bucket",
  "make-it-worse": "worseForm",
};

/** Each Make It Worse trap's icon, for the builder, the progress board and the reveal. */
export const TRAP_ICON: Record<TrapId, IconName> = {
  runaway: "runaway",
  modals: "popups",
  tabmaze: "tabMaze",
  captcha: "captcha",
  terms: "terms",
  disguised: "disguised",
  confirmshame: "bigYes",
  reversed: "backwards",
  doubleneg: "doubleNegative",
  ghost: "ghost",
  slider: "slider",
  tiny: "tinyTarget",
};

/** Each Retro Report award's icon. Stored reports only keep award ids, so this is the one place they get art. */
export const AWARD_ICON: Record<string, IconName> = {
  "nps-100": "trophy",
  "churn-risk": "chartDown",
  "voice-of-customer": "megaphone",
  "turing-test": "robot",
  "bot-hunter": "magnifier",
  "suspiciously-human": "grimace",
  "mind-reader": "crystal",
  "statistical-outlier": "outlier",
  "most-likely-to": "eyes",
  "pixel-picasso": "palette",
  "nailed-it": "target",
  "lost-in-translation": "cans",
  "master-forger": "frame",
  "art-critic": "monocle",
  "last-brick-standing": "brick",
  "knockout-artist": "burst",
  bulldozer: "bulldozer",
  "gravity-tester": "parachute",
  "sky-is-falling": "drop",
  "jumped-the-gun": "sneaker",
  "patience-of-a-saint": "hourglass",
  "doodle-champion": "trophy",
  "leg-day": "leg",
  "look-no-hands": "noHands",
  noodled: "noodles",
  "high-roller": "coins",
  "lasso-legend": "hat",
  "wet-paint": "brush",
  "pot-luck": "bucket",
  bullseye: "bullseye",
  "colour-whisperer": "speech",
  "scenic-route": "compass",
  "smash-hit": "shootingStar",
  "comeback-kid": "boomerang",
  "power-hungry": "battery",
  "no-help-needed": "melting",
  "misunderstood-artist": "wilted",
  "dark-lord-of-ux": "worseForm",
  "escape-artist": "runaway",
  "read-the-fine-print": "magnifier",
  "most-sued": "gavel",
  "premium-member": "card",
};

export const awardIcon = (id: string): IconName => AWARD_ICON[id] ?? "star";

const paths = new Map<string, Path2D>();
const path2d = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

/** Draws an icon on a canvas, `size` pixels square and centred on `x`, `y`. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number) {
  const parts: readonly IconPart[] = ICONS[name];
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 32, size / 32);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  for (const part of parts) {
    const p = path2d(part.d);
    if ("band" in part) {
      ctx.lineWidth = part.w + ICON_OUTLINE * 2;
      ctx.stroke(p);
      ctx.strokeStyle = part.band;
      ctx.lineWidth = part.w;
      ctx.stroke(p);
      ctx.strokeStyle = INK;
    } else if ("line" in part) {
      ctx.lineWidth = part.line;
      ctx.stroke(p);
    } else {
      ctx.fillStyle = part.fill;
      ctx.fill(p);
      if (!part.bare) {
        ctx.lineWidth = ICON_OUTLINE;
        ctx.stroke(p);
      }
    }
  }
  ctx.restore();
}
