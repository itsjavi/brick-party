const STORAGE_KEY = "brick-party:recovery-key";

/** Keeps the player's recovery key on this device so the profile page can show it again. */
export function rememberKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private mode or blocked storage: the player saw the key and can copy it now.
  }
}

export function recallKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}
