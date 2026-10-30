export type ShapeTool = "rect" | "ellipse" | "triangle";

/** Shapes smaller than this many canvas units both ways are a slip of the pointer, not a shape. */
export const MIN_SHAPE = 6;

/**
 * The closed outline of a shape dragged from `from` to `to`, in canvas units. `square` keeps it as wide as it is tall.
 * A triangle points toward where the drag started: up when dragging down, down when dragging up.
 */
export function shapePoints(tool: ShapeTool, from: readonly number[], to: readonly number[], square = false): number[][] {
  const [x0, y0] = [from[0]!, from[1]!];
  let [dx, dy] = [to[0]! - x0, to[1]! - y0];
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const [x1, y1] = [x0 + dx, y0 + dy];
  switch (tool) {
    case "rect":
      return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    case "triangle":
      return [[(x0 + x1) / 2, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y0]];
    case "ellipse": {
      const [cx, cy, rx, ry] = [(x0 + x1) / 2, (y0 + y1) / 2, Math.abs(dx) / 2, Math.abs(dy) / 2];
      // About one point every 12 units of outline, enough for a smooth curve at any size.
      const steps = Math.min(96, Math.max(24, Math.round((Math.PI * (rx + ry)) / 12)));
      const points = Array.from({ length: steps }, (_, i) => {
        const a = (i / steps) * 2 * Math.PI;
        return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
      });
      return [...points, points[0]!];
    }
  }
}

/** Whether a drag made a shape big enough to keep. */
export function bigEnough(points: number[][]): boolean {
  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  return Math.max(...xs) - Math.min(...xs) >= MIN_SHAPE || Math.max(...ys) - Math.min(...ys) >= MIN_SHAPE;
}
