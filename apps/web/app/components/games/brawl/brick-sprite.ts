/**
 * A player's brick avatar drawn on a canvas, matching the HTML `Brick` in ui/Brick.stsx shape for shape. Every
 * measurement below is that component's CSS, in its `em` units. Each look is drawn once into a small offscreen canvas
 * and reused, so the arena only copies pixels each frame.
 */
import type { Avatar, AvatarInput } from "@brick/game";
import { AVATAR_HEX } from "../../../lib/avatar";

export type BrickMood = "happy" | "wow" | "sad" | "sleepy" | "sly";
/** `ghost` is a brick previewing a move; `ghost-falls` previews one falling off. */
export type SpriteVariant = "normal" | "ghost" | "ghost-falls";

const INK = "#1b1f3b";
/** Which studs each shape has on top, as in ui/Brick.stsx. */
const STUDS: Record<Avatar["shape"], ("left" | "mid" | "right")[]> = {
  brick: ["left", "right"],
  round: ["mid"],
  triple: ["left", "mid", "right"],
  tile: [],
  jelly: ["left", "right"],
  slim: ["mid"],
};

/** The sprite's extent around the brick's own 10 x 7.2 box, in em: room for hats above and the headset's sides. */
const SPRITE = { left: 2.4, top: 4.4, width: 13.6, height: 12 };
/** The brick box's height; with its 1.4em top margin the HTML brick is centered 0.7em below its slot's middle. */
export const BRICK_HEIGHT = 7.2;
export const BRICK_DROP = 0.7;

export interface Sprite {
  image: HTMLCanvasElement;
  /** CSS px from the brick box's top-left corner to the sprite's top-left corner (both negative). */
  ox: number;
  oy: number;
  width: number;
  height: number;
  /** The brick box's width in CSS px, to center it. */
  brickWidth: number;
}

export function brickWidth(avatar: AvatarInput): number {
  return (avatar.shape ?? "brick") === "slim" ? 7.6 : 10;
}

/** Draws sprites at one size and pixel ratio, remembering each (avatar, mood, variant) it has drawn. */
export class SpriteCache {
  private cache = new Map<string, Sprite>();
  private scale = "";

  get(
    avatar: AvatarInput,
    mood: BrickMood,
    em: number,
    dpr: number,
    variant: SpriteVariant = "normal",
  ): Sprite {
    const scale = `${em.toFixed(3)}@${dpr}`;
    if (scale !== this.scale) {
      this.cache.clear();
      this.scale = scale;
    }
    const key = `${avatar.color}|${avatar.hat}|${avatar.face ?? "classic"}|${avatar.shape ?? "brick"}|${mood}|${variant}`;
    let sprite = this.cache.get(key);
    if (!sprite) {
      sprite =
        variant === "normal"
          ? drawSprite(avatar, mood, em, dpr)
          : ghostOf(this.get(avatar, mood, em, dpr), variant);
      this.cache.set(key, sprite);
    }
    return sprite;
  }
}

function drawSprite(avatar: AvatarInput, mood: BrickMood, em: number, dpr: number): Sprite {
  const image = document.createElement("canvas");
  image.width = Math.ceil(SPRITE.width * em * dpr);
  image.height = Math.ceil(SPRITE.height * em * dpr);
  const ctx = image.getContext("2d")!;
  ctx.scale(em * dpr, em * dpr);
  ctx.translate(SPRITE.left, SPRITE.top);
  // The HTML brick's outlines are clamp(2px, 0.38em, 5px).
  drawBrick(ctx, avatar, mood, Math.min(5, Math.max(2, 0.38 * em)) / em);
  return {
    image,
    ox: -SPRITE.left * em,
    oy: -SPRITE.top * em,
    width: SPRITE.width * em,
    height: SPRITE.height * em,
    brickWidth: brickWidth(avatar) * em,
  };
}

/** Ghosts are washed out: `saturate(0.6)`, or `grayscale(0.6)` for one falling off. Opacity is applied when drawn. */
function ghostOf(base: Sprite, variant: Exclude<SpriteVariant, "normal">): Sprite {
  const image = document.createElement("canvas");
  image.width = base.image.width;
  image.height = base.image.height;
  const ctx = image.getContext("2d")!;
  ctx.filter = variant === "ghost" ? "saturate(0.6)" : "grayscale(0.6)";
  ctx.drawImage(base.image, 0, 0);
  return { ...base, image };
}

type Ctx = CanvasRenderingContext2D;

/** A rounded rectangle with per-corner elliptical radii [rx, ry], clockwise from the top-left. */
function roundedPath(ctx: Ctx, x: number, y: number, w: number, h: number, radii: [number, number][]) {
  const [tl, tr, br, bl] = radii as [[number, number], [number, number], [number, number], [number, number]];
  ctx.moveTo(x + tl[0], y);
  ctx.lineTo(x + w - tr[0], y);
  ctx.ellipse(x + w - tr[0], y + tr[1], tr[0], tr[1], 0, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - br[1]);
  ctx.ellipse(x + w - br[0], y + h - br[1], br[0], br[1], 0, 0, Math.PI / 2);
  ctx.lineTo(x + bl[0], y + h);
  ctx.ellipse(x + bl[0], y + h - bl[1], bl[0], bl[1], 0, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + tl[1]);
  ctx.ellipse(x + tl[0], y + tl[1], tl[0], tl[1], 0, Math.PI, (3 * Math.PI) / 2);
  ctx.closePath();
}

/** CSS shrinks every corner's radii by the same factor when neighbors would overlap. */
function fitRadii(w: number, h: number, radii: [number, number][]): [number, number][] {
  const [tl, tr, br, bl] = radii as [[number, number], [number, number], [number, number], [number, number]];
  const f = Math.min(
    1,
    w / (tl[0] + tr[0] || 1),
    w / (bl[0] + br[0] || 1),
    h / (tl[1] + bl[1] || 1),
    h / (tr[1] + br[1] || 1),
  );
  return radii.map(([rx, ry]) => [Math.max(0, rx * f), Math.max(0, ry * f)]);
}

function rrect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number],
) {
  const rs = typeof r === "number" ? [r, r, r, r] : r;
  roundedPath(
    ctx,
    x,
    y,
    w,
    h,
    fitRadii(
      w,
      h,
      rs.map((v) => [v, v] as [number, number]),
    ),
  );
}

function fillShape(ctx: Ctx, color: string, draw: () => void) {
  ctx.beginPath();
  draw();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawBrick(ctx: Ctx, avatar: AvatarInput, mood: BrickMood, bw: number) {
  const face = avatar.face ?? "classic";
  const shape = avatar.shape ?? "brick";
  const color = AVATAR_HEX[avatar.color];
  const W = brickWidth(avatar);
  const H = BRICK_HEIGHT;
  ctx.lineJoin = "round";

  // Studs: open at the bottom, where the body covers them.
  for (const at of STUDS[shape]) {
    const sw = shape === "triple" ? 2 : at === "mid" ? (shape === "slim" ? 2.6 : 3) : 2.5;
    const side = shape === "triple" ? 1 : 1.5;
    const x = at === "left" ? side : at === "right" ? W - side - sw : W / 2 - sw / 2;
    const y = -1.3;
    const h = 1.5;
    fillShape(ctx, color, () => rrect(ctx, x, y, sw, h, [0.8, 0.8, 0, 0]));
    const i = bw / 2;
    const r = Math.min(0.8 - i, (sw - bw) / 2);
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.arcTo(x + i, y + i, x + sw / 2, y + i, r);
    ctx.arcTo(x + sw - i, y + i, x + sw - i, y + h, r);
    ctx.lineTo(x + sw - i, y + h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = bw;
    ctx.stroke();
  }

  // The body, inset by `i` and shifted by (dx, dy).
  const body = (i: number, dx = 0, dy = 0) => {
    if (shape === "jelly") {
      // border-radius: 46% 54% 42% 58% / 58% 50% 50% 42%
      const radii: [number, number][] = [
        [0.46 * W, 0.58 * H],
        [0.54 * W, 0.5 * H],
        [0.42 * W, 0.5 * H],
        [0.58 * W, 0.42 * H],
      ];
      roundedPath(
        ctx,
        i + dx,
        i + dy,
        W - 2 * i,
        H - 2 * i,
        radii.map(([rx, ry]) => [Math.max(0, rx - i), Math.max(0, ry - i)]),
      );
    } else {
      const r = shape === "round" ? 3.6 : shape === "tile" ? 1 : 1.5;
      rrect(ctx, i + dx, i + dy, W - 2 * i, H - 2 * i, Math.max(0, r - i));
    }
  };
  fillShape(ctx, color, () => body(0));
  // box-shadow: inset -0.85em -0.85em 0 rgba(0, 0, 0, 0.14)
  ctx.save();
  ctx.beginPath();
  body(bw);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(-1, -1, W + 2, H + 2);
  body(bw, -0.85, -0.85);
  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  ctx.fill("evenodd");
  ctx.restore();
  ctx.beginPath();
  body(bw / 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = bw;
  ctx.stroke();

  // Everything on the face is placed inside the outline, like children of the HTML body.
  const IW = W - 2 * bw;
  const left = (a: number) => bw + a;
  const right = (a: number, w: number) => bw + IW - a - w;
  const center = (w: number) => bw + IW / 2 - w / 2;
  const top = (t: number) => bw + t;
  const ellipse = (x: number, y: number, w: number, h: number) =>
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);

  // Eyes.
  if (face !== "shades") {
    if (face === "cyclops") {
      const [w, h, t] =
        mood === "wow"
          ? [2.3, 2.6, 1.4]
          : mood === "sleepy" || mood === "sly"
            ? [1.9, 0.5, 2.6]
            : mood === "sad"
              ? [1.9, 2.3, 2]
              : [1.9, 2.3, 1.6];
      eye(ctx, center(w), top(t), w, h, mood);
    } else {
      const [w, h, t] =
        mood === "wow"
          ? [1.5, 2.1, 1.6]
          : mood === "sleepy" || mood === "sly"
            ? [1.25, 0.45, 2.6]
            : mood === "sad"
              ? [1.25, 1.75, 2.3]
              : [1.25, 1.75, 1.9];
      const inset = shape === "slim" ? 1.8 : 2.6;
      eye(ctx, left(inset), top(t), w, h, mood);
      eye(ctx, right(inset, w), top(t), w, h, mood);
    }
  }

  // Mouth.
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  if (mood === "wow") {
    ctx.beginPath();
    ctx.arc(bw + IW / 2, top(4) + 0.6, (1.2 - 0.38) / 2, 0, Math.PI * 2);
    ctx.lineWidth = 0.38;
    ctx.stroke();
  } else if (mood === "sleepy") {
    fillShape(ctx, INK, () => rrect(ctx, center(1.4), top(4.6), 1.4, 0.3, [0, 0, 0.3, 0.3]));
  } else if (mood === "sad") {
    // A frown: the top border of a box whose top corners are rounded.
    const w = 2.3;
    const h = 0.95;
    const cx = bw + IW / 2;
    const base = top(4.6) + h;
    ctx.beginPath();
    ctx.ellipse(cx, base, w / 2, h, 0, Math.PI, 2 * Math.PI);
    ctx.ellipse(cx, base, w / 2, h - 0.38, 0, 2 * Math.PI, Math.PI, true);
    ctx.fill();
  } else {
    // A smile (sly tips it and slides it right): the bottom border of a box whose bottom corners are rounded.
    const w = mood === "sly" ? 2.2 : 2.3;
    const h = 0.95;
    const cx = bw + IW / 2 + (mood === "sly" ? 0.1 * w : 0);
    const y = top(4.15);
    ctx.save();
    if (mood === "sly") {
      ctx.translate(cx, y + h / 2);
      ctx.rotate((-8 * Math.PI) / 180);
      ctx.translate(-cx, -(y + h / 2));
    }
    ctx.beginPath();
    ctx.ellipse(cx, y, w / 2, h, 0, Math.PI, 0, true);
    ctx.ellipse(cx, y, w / 2, h - 0.38, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // What the face adds.
  switch (face) {
    case "blush":
      ctx.fillStyle = "rgba(255, 70, 120, 0.45)";
      ctx.beginPath();
      ellipse(left(1.25), top(3.75), 1.5, 0.8);
      ctx.fill();
      ctx.beginPath();
      ellipse(right(1.25, 1.5), top(3.75), 1.5, 0.8);
      ctx.fill();
      break;
    case "freckles":
      ctx.fillStyle = "rgba(27, 31, 59, 0.5)";
      for (const x of [left(1.5), right(2.05, 0.3)]) {
        for (const [dx, dy] of [
          [0, 0],
          [0.55, 0.15],
          [0.2, 0.55],
        ] as const) {
          ctx.beginPath();
          ellipse(x + dx, top(3.75) + dy, 0.3, 0.3);
          ctx.fill();
        }
      }
      break;
    case "glasses":
      for (const x of [left(2), right(2, 2.45)]) {
        ctx.beginPath();
        ctx.arc(x + 2.45 / 2, top(1.55) + 2.45 / 2, (2.45 - 0.32) / 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.fill();
        ctx.lineWidth = 0.32;
        ctx.stroke();
      }
      ctx.fillStyle = INK;
      ctx.fillRect(center(1.3), top(2.55), 1.3, 0.32);
      break;
    case "shades": {
      const x = left(1.6);
      const y = top(1.65);
      const w = IW - 3.2;
      const h = 1.55;
      fillShape(ctx, INK, () => rrect(ctx, x, y, w, h, [0.4, 0.4, 1.1, 1.1]));
      // linear-gradient(160deg, transparent 18%, rgba(255, 255, 255, 0.35) 18% 27%, transparent 27%)
      const a = (160 * Math.PI) / 180;
      const [dx, dy] = [Math.sin(a), -Math.cos(a)];
      const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
      const [cx, cy] = [x + w / 2, y + h / 2];
      const g = ctx.createLinearGradient(
        cx - (dx * len) / 2,
        cy - (dy * len) / 2,
        cx + (dx * len) / 2,
        cy + (dy * len) / 2,
      );
      g.addColorStop(0.18, "rgba(255, 255, 255, 0)");
      g.addColorStop(0.18, "rgba(255, 255, 255, 0.35)");
      g.addColorStop(0.27, "rgba(255, 255, 255, 0.35)");
      g.addColorStop(0.27, "rgba(255, 255, 255, 0)");
      ctx.beginPath();
      rrect(ctx, x, y, w, h, [0.4, 0.4, 1.1, 1.1]);
      ctx.fillStyle = g;
      ctx.fill();
      break;
    }
    case "mustache": {
      const y = top(3.45);
      const cx = bw + IW / 2;
      // Each half tips up from the middle.
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx, y + 0.375);
        ctx.rotate((side * 10 * Math.PI) / 180);
        ctx.beginPath();
        if (side < 0) rrect(ctx, -1.6, -0.375, 1.6, 0.75, [1, 0.2, 0.3, 1]);
        else rrect(ctx, 0, -0.375, 1.6, 0.75, [0.2, 1, 1, 0.3]);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "brows":
      for (const [x, deg] of [
        [left(2.35), 12],
        [right(2.35, 1.7), -12],
      ] as const) {
        ctx.save();
        ctx.translate(x + 0.85, top(1.15) + 0.21);
        ctx.rotate((deg * Math.PI) / 180);
        fillShape(ctx, INK, () => rrect(ctx, -0.85, -0.21, 1.7, 0.42, 0.3));
        ctx.restore();
      }
      break;
    default:
      break;
  }

  if (avatar.hat !== "none") drawHat(ctx, avatar.hat, W);
}

function eye(ctx: Ctx, x: number, y: number, w: number, h: number, mood: BrickMood) {
  ctx.beginPath();
  if (mood === "sleepy" || mood === "sly") rrect(ctx, x, y, w, h, 0.3);
  else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
}

/** The hats' SVGs from ui/Brick.stsx, drawn in their own viewBox units. */
function drawHat(ctx: Ctx, hat: Exclude<Avatar["hat"], "none">, W: number) {
  const box: Record<typeof hat, { vb: [number, number]; width: number; bottom?: number; top?: number }> = {
    cap: { vb: [100, 50], width: 6.4, bottom: 0.4 },
    crown: { vb: [100, 50], width: 6.4, bottom: 0.4 },
    beanie: { vb: [100, 56], width: 6.4, bottom: 0.4 },
    party: { vb: [100, 70], width: 5.6, bottom: 0.2 },
    tophat: { vb: [100, 70], width: 5.6, bottom: 0.2 },
    headset: { vb: [140, 70], width: 12, top: -3.2 },
    halo: { vb: [100, 30], width: 7, bottom: 1.4 },
  };
  const { vb, width, bottom, top } = box[hat];
  const k = width / vb[0];
  const height = vb[1] * k;
  ctx.save();
  ctx.translate(W / 2 - width / 2, top ?? -(bottom ?? 0) - height);
  ctx.scale(k, k);
  ctx.lineJoin = "round";
  const ink = INK;
  const paint = (
    path: Path2D,
    fill: string | null,
    stroke?: string,
    width = 0,
    cap: CanvasLineCap = "butt",
  ) => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = cap;
      ctx.stroke(path);
    }
  };
  const circle = (cx: number, cy: number, r: number) => {
    const p = new Path2D();
    p.arc(cx, cy, r, 0, Math.PI * 2);
    return p;
  };
  const rect = (x: number, y: number, w: number, h: number, r = 0) => {
    const p = new Path2D();
    if (r) p.roundRect(x, y, w, h, r);
    else p.rect(x, y, w, h);
    return p;
  };
  const oval = (cx: number, cy: number, rx: number, ry: number) => {
    const p = new Path2D();
    p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    return p;
  };
  switch (hat) {
    case "cap":
      paint(new Path2D("M22 44 C 22 10, 74 6, 78 44 Z"), "#ff5a4e", ink, 6);
      paint(new Path2D("M70 42 L 98 44 L 96 50 L 66 48 Z"), "#ff5a4e", ink, 6);
      paint(circle(50, 12, 5), ink);
      break;
    case "crown":
      paint(new Path2D("M22 46 L 22 12 L 38 28 L 50 6 L 62 28 L 78 12 L 78 46 Z"), "#ffcc33", ink, 6);
      paint(circle(50, 34, 5), "#ff5a4e", ink, 3);
      break;
    case "party":
      paint(new Path2D("M30 66 L 50 10 L 70 66 Z"), "#8b6cff", ink, 6);
      paint(new Path2D("M40 40 L 60 40 M 35 54 L 65 54"), null, "#ffcc33", 6, "round");
      paint(circle(50, 9, 8), "#ffcc33", ink, 5);
      break;
    case "tophat":
      paint(rect(32, 6, 36, 52, 4), ink);
      paint(rect(32, 40, 36, 9), "#ff5a4e");
      paint(rect(18, 56, 64, 10, 5), ink);
      break;
    case "beanie":
      paint(new Path2D("M20 46 C 20 14, 80 14, 80 46 Z"), "#00c4b8", ink, 6);
      paint(rect(16, 40, 68, 14, 6), "#5fd068", ink, 5);
      paint(circle(50, 12, 9), "#ffffff", ink, 5);
      break;
    case "headset":
      paint(new Path2D("M16 66 C 16 6, 124 6, 124 66"), null, ink, 8, "round");
      paint(rect(4, 44, 22, 26, 8), "#8b6cff", ink, 5);
      paint(rect(114, 44, 22, 26, 8), "#8b6cff", ink, 5);
      break;
    case "halo":
      paint(oval(50, 15, 34, 9), null, "#ffcc33", 7);
      paint(oval(50, 15, 34, 9), null, ink, 2);
      break;
  }
  ctx.restore();
}
