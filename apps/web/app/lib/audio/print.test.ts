import { describe, expect, test } from "vitest";
import { soundPrint } from "./print";

const RATE = 44100;
const loudestRow = (column: Float32Array) => column.indexOf(Math.max(...column));
const rowOf = (hz: number, rows: number) => Math.floor(((Math.log(hz) - Math.log(60)) / (Math.log(12000) - Math.log(60))) * rows);

describe("soundPrint", () => {
  test("a steady tone lights the band it's in", () => {
    const samples = Float32Array.from({ length: RATE }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / RATE));
    const print = soundPrint(samples, RATE);
    for (const column of print.cells) expect(Math.abs(loudestRow(column) - rowOf(1000, print.rows))).toBeLessThanOrEqual(1);
  });

  test("a rising sweep climbs, and silence stays dark", () => {
    let phase = 0;
    const samples = Float32Array.from({ length: RATE }, (_, i) => {
      phase += (2 * Math.PI * (200 * 20 ** (i / RATE))) / RATE;
      return Math.sin(phase);
    });
    const print = soundPrint(samples, RATE);
    expect(loudestRow(print.cells.at(-2)!)).toBeGreaterThan(loudestRow(print.cells[1]!) + 10);
    const quiet = soundPrint(new Float32Array(RATE), RATE);
    for (const column of quiet.cells) expect(Math.max(...column)).toBe(0);
  });
});
