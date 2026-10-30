import { describe, expect, test, vi } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettingsStore, normalizeSettings, parseStoredSettings } from "./settings";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("settings", () => {
  test("clamps and rounds volumes, keeps booleans", () => {
    expect(normalizeSettings({ music: 1.7, sfx: -2, muted: true })).toEqual({ music: 1, sfx: 0, muted: true });
    expect(normalizeSettings({ music: 0.333333 }).music).toBe(0.33);
    expect(normalizeSettings({ music: "loud", sfx: Number.NaN, muted: "yes" })).toEqual(DEFAULT_SETTINGS);
  });

  test("falls back to defaults for missing or broken storage", () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('{"music":0.2}')).toEqual({ ...DEFAULT_SETTINGS, music: 0.2 });
  });

  test("persists changes, notifies subscribers, and keeps a stable snapshot", () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ music: 0.3, sfx: 0.4, muted: false }) });
    const store = createSettingsStore(() => storage);
    const first = store.get();
    expect(first).toEqual({ music: 0.3, sfx: 0.4, muted: false });
    expect(store.get()).toBe(first);

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ muted: true, sfx: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ music: 0.3, sfx: 1, muted: true });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ music: 0.3, sfx: 1, muted: true });

    store.set({ muted: true });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test("works when storage throws", () => {
    const broken = memoryStorage();
    broken.setItem = () => {
      throw new Error("quota");
    };
    const store = createSettingsStore(() => broken);
    store.set({ music: 0.1 });
    expect(store.get().music).toBe(0.1);
  });
});
