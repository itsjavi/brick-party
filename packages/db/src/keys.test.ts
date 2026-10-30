import { describe, expect, test } from "vitest";
import { generateRecoveryKey, hashRecoveryKey, normalizeRecoveryKey } from "./keys";

describe("recovery keys", () => {
  test("look like BRIK-XXXX-XXXX-XXXX in Crockford base32", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryKey()).toMatch(/^BRIK-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
    expect(new Set(Array.from({ length: 200 }, generateRecoveryKey)).size).toBe(200);
  });

  test("normalize sloppy input to the same key", async () => {
    const key = "BRIK-7F3K-Q9PX-M2TD";
    for (const variant of ["brik-7f3k-q9px-m2td", "7F3K Q9PX M2TD", "7f3kq9pxm2td", " BRIK 7F3K-Q9PX-M2TD "]) {
      expect(normalizeRecoveryKey(variant)).toBe("7F3KQ9PXM2TD");
      expect(await hashRecoveryKey(variant)).toBe(await hashRecoveryKey(key));
    }
    expect(normalizeRecoveryKey("BRIK-0OIL-0000-0000")).toBe("001100000000");
    expect(normalizeRecoveryKey("BRIK-UUUU-0000-0000")).toBeNull();
    expect(normalizeRecoveryKey("1O0I")).toBeNull();
  });

  test("hashes are hex SHA-256 and never contain the key", async () => {
    const key = generateRecoveryKey();
    const hash = await hashRecoveryKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(normalizeRecoveryKey(key)!.toLowerCase());
  });
});
