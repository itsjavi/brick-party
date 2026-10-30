import { TICK_MS } from "@brick/game";
import { expect, test } from "vitest";
import { captionAt, ringTick } from "./ringRenderer";

test("the commentary shows the latest line said so far", () => {
  const captions = [{ t: 0 }, { t: 12 }, { t: 30 }];
  expect(captionAt([], 5)).toBe(-1);
  expect(captionAt([{ t: 3 }], 2)).toBe(-1);
  expect(captionAt(captions, 0)).toBe(0);
  expect(captionAt(captions, 29.9)).toBe(1);
  expect(captionAt(captions, 100)).toBe(2);
});

test("the replay follows the server's clock while it runs, and rests past its end once finished", () => {
  const track = { end: 80 };
  const fight = { frames: [[0]] };
  expect(ringTick(track, fight, 1000, false, 1000 + 25 * TICK_MS)).toBeCloseTo(25);
  expect(ringTick(track, fight, 1000, true, 1000 + 25 * TICK_MS)).toBe(100);
  expect(ringTick(track, { frames: [] }, 1000, false, 5000)).toBe(100);
});
