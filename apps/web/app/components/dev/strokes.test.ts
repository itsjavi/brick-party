import { DOODLE_LIMITS, type Stroke } from "@brick/game";
import { describe, expect, it } from "vitest";
import { packStrokes } from "../games/skip-logic/simplify";
import { drawingJson, parseDrawing, toLocal } from "./strokes";

const zigzag: Stroke = { c: 2, w: 1, p: [100, 100, 200, 300, 300, 120, 420, 340], t: "legs" };
const fill: Stroke = { c: 4, w: 0, p: [10, 10, 90, 10, 90, 90, 10, 90, 10, 10], k: "fill", t: "body" };

describe("toLocal", () => {
  it("packs back to the stroke it came from", () => {
    expect(packStrokes([zigzag, fill].map(toLocal), DOODLE_LIMITS)).toEqual([zigzag, fill]);
  });
});

describe("parseDrawing", () => {
  it("reads a list of strokes", () => {
    expect(parseDrawing(JSON.stringify([zigzag]))).toEqual({ strokes: [zigzag], weapon: null });
  });

  it("reads strokes with a weapon, as exported", () => {
    expect(parseDrawing(drawingJson([zigzag, fill], "blaster"))).toEqual({
      strokes: [zigzag, fill],
      weapon: "blaster",
    });
    expect(parseDrawing(drawingJson([zigzag]))).toEqual({ strokes: [zigzag], weapon: null });
  });

  it("draws shape commands", () => {
    const { strokes, weapon } = parseDrawing(
      "part body; fill circle 500 500 200; part legs; line 450 700 400 900; weapon blaster",
    );
    expect(strokes.map((s) => s.t)).toEqual(["body", "legs"]);
    expect(weapon).toBe("blaster");
  });

  it("explains what's wrong", () => {
    expect(() => parseDrawing("")).toThrow(/Paste/);
    expect(() => parseDrawing("[1, 2")).toThrow(/valid JSON/);
    expect(() => parseDrawing('[{"c": 0}]')).toThrow(/Not a drawing/);
    expect(() => parseDrawing("blob 1 2 3")).toThrow();
  });
});
