/** Crockford base32: no I, L, O or U, so keys survive being read aloud or retyped. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_CHARS = 12;
const KEY_PREFIX = "BRIK";

/** A fresh recovery key, e.g. `BRIK-7F3K-Q9PX-M2TD` (60 random bits). */
export function generateRecoveryKey(): string {
  const chars = [...crypto.getRandomValues(new Uint8Array(KEY_CHARS))].map((b) => ALPHABET[b & 31]).join("");
  return [KEY_PREFIX, chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].join("-");
}

/** Accepts sloppy input (lowercase, spaces, missing prefix, O for 0, I/L for 1). `null` if it can't be a key. */
export function normalizeRecoveryKey(input: string): string | null {
  let chars = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (chars.length === KEY_PREFIX.length + KEY_CHARS && chars.startsWith("BR1K")) chars = chars.slice(4);
  if (chars.length !== KEY_CHARS || [...chars].some((c) => !ALPHABET.includes(c))) return null;
  return chars;
}

/** Hex SHA-256 of the normalized key; the only form of the key the database ever sees. */
export async function hashRecoveryKey(key: string): Promise<string> {
  const normalized = normalizeRecoveryKey(key);
  if (!normalized) throw new Error("Invalid recovery key");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
