import { AWARD_INFO, GAME_IDS, TRAP_IDS } from "@brick/game";
import { describe, expect, test } from "vitest";
import { AWARD_ICON, GAME_ICON, ICONS, TRAP_ICON } from "./icons";

describe("icons", () => {
  test("every game and every award has its own art", () => {
    for (const id of GAME_IDS) expect(ICONS[GAME_ICON[id]]).toBeDefined();
    for (const id of Object.keys(AWARD_INFO)) expect(AWARD_ICON[id], id).toBeDefined();
    for (const id of TRAP_IDS) expect(ICONS[TRAP_ICON[id]], id).toBeDefined();
  });

  test("every icon is made of SVG paths with something to draw", () => {
    for (const [name, parts] of Object.entries(ICONS)) {
      expect(parts.length, name).toBeGreaterThan(0);
      for (const part of parts) expect(part.d, name).toMatch(/^M[\d.\s-]/);
    }
  });
});
