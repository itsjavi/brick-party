import { KEY } from "@brick/game";
import { describe, expect, test } from "vitest";
import { KEYMAP, KeyState } from "./controls";

describe("Doodle Smash controls", () => {
  test("arrows run, jump and drop, Space attacks, and B or Shift shields; Cmd does nothing", () => {
    expect([KEYMAP.ArrowLeft, KEYMAP.ArrowRight, KEYMAP.ArrowUp, KEYMAP.ArrowDown]).toEqual([
      KEY.left,
      KEY.right,
      KEY.up,
      KEY.down,
    ]);
    expect(KEYMAP.Space).toBe("attack");
    expect([KEYMAP.KeyB, KEYMAP.ShiftLeft, KEYMAP.ShiftRight]).toEqual([KEY.shield, KEY.shield, KEY.shield]);
    expect(KEYMAP.MetaLeft).toBeUndefined();
  });

  test("keys from the keyboard and on-screen buttons add up, and each lets go on its own", () => {
    const keys = new KeyState();
    keys.press("keyboard", KEY.left, true);
    keys.press("touch:attack", "attack", true);
    keys.press("touch:left", KEY.left, true);
    expect([keys.held, keys.attack]).toEqual([KEY.left, true]);
    keys.press("keyboard", KEY.left, false);
    expect(keys.held).toBe(KEY.left);
    keys.press("touch:left", KEY.left, false);
    keys.press("touch:attack", "attack", false);
    expect([keys.held, keys.attack]).toEqual([0, false]);
  });
});
