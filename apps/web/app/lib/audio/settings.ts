import type { AudioSettings } from "./types";

export const SETTINGS_KEY = "brickparty:audio";
export const DEFAULT_SETTINGS: AudioSettings = { music: 0.6, sfx: 0.8, muted: false };

const clamp01 = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 100) / 100 : fallback;

/** Coerces anything (a patch, stored JSON) into valid settings, falling back to `base` per field. */
export function normalizeSettings(input: unknown, base: AudioSettings = DEFAULT_SETTINGS): AudioSettings {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return {
    music: clamp01(obj.music, base.music),
    sfx: clamp01(obj.sfx, base.sfx),
    muted: typeof obj.muted === "boolean" ? obj.muted : base.muted,
  };
}

export function parseStoredSettings(raw: string | null): AudioSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const sameSettings = (a: AudioSettings, b: AudioSettings) =>
  a.music === b.music && a.sfx === b.sfx && a.muted === b.muted;

/**
 * Settings shared by every component and tab. Reads localStorage lazily on the client, writes back on
 * every change, and follows other tabs through the `storage` event.
 */
export function createSettingsStore(storage: () => Storage | null) {
  let current: AudioSettings | null = null;
  const listeners = new Set<() => void>();
  let watching = false;

  const read = (): AudioSettings => {
    if (current) return current;
    let raw: string | null = null;
    try {
      raw = storage()?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      raw = null;
    }
    current = parseStoredSettings(raw);
    return current;
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_KEY) return;
    const next = parseStoredSettings(event.newValue);
    if (current && sameSettings(current, next)) return;
    current = next;
    emit();
  };

  return {
    get: read,
    set(patch: Partial<AudioSettings>) {
      const prev = read();
      const next = normalizeSettings({ ...prev, ...patch }, prev);
      if (sameSettings(prev, next)) return;
      current = next;
      try {
        storage()?.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Private mode or blocked storage: the setting still applies for this page.
      }
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!watching && typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
        watching = true;
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && watching && typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage);
          watching = false;
        }
      };
    },
  };
}

const browserStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const settingsStore = createSettingsStore(browserStorage);
