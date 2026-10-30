/** Small helpers the fight canvases share: sizing to the page, fonts, text with an outline, and a few shapes. */

/** Device pixels per CSS pixel, capped: past 2 a phone pays for pixels nobody sees. */
export const pixelRatio = () => Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));

/**
 * Keeps `canvas`'s backing store at its CSS size in device pixels, and calls `onResize` with its CSS width and height
 * whenever that changes. Returns a function that stops watching.
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  onResize: (width: number, height: number) => void,
): () => void {
  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = pixelRatio();
    const w = Math.max(1, Math.round(rect.width * ratio));
    const h = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    onResize(rect.width, rect.height);
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  return () => observer.disconnect();
}

/** The page's display and body fonts (`tokens.css`), for text drawn on a canvas. */
export function pageFonts(el: Element): { display: string; body: string } {
  const style = getComputedStyle(el);
  return {
    display: style.getPropertyValue("--font-display").trim() || "system-ui, sans-serif",
    body: style.getPropertyValue("--font-body").trim() || "system-ui, sans-serif",
  };
}

/** Text with an outline under its fill, like SVG text with `paint-order: stroke`. Centered on `x`, baseline at `y`. */
export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  stroke: string,
  width: number,
) {
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (width > 0) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** A rounded rectangle's path, started fresh. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A circle's path, started fresh. */
export function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

const STAR_POINTS = 16;

/** A spiky star's path around `x`, `y`, turned by `deg` degrees, started fresh. */
export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, deg = 0) {
  const turn = (deg * Math.PI) / 180;
  ctx.beginPath();
  for (let k = 0; k < STAR_POINTS; k++) {
    const a = (k * Math.PI) / 8 + turn;
    const rr = k % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * The "slam" entrance the HTML overlays use, at `age` ms after it started: the scale, from 2.2 down to 1 with a small
 * bounce (an ease-out with an overshoot, like `cubic-bezier(0.2, 1.8, 0.4, 1)`).
 */
export function slamScale(age: number, duration = 300): number {
  const u = Math.min(1, Math.max(0, age / duration)) - 1;
  return 2.2 - 1.2 * (1 + 2.70158 * u * u * u + 1.70158 * u * u);
}

/** The slam's opacity: it fades in over its first part. */
export const slamAlpha = (age: number, duration = 300) => Math.min(1, Math.max(0, (age / duration) * 2.5));
