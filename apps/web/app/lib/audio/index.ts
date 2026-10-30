// Public audio API. Everything is synthesized at runtime with the Web Audio API; nothing touches
// `window` until a function runs on the client, and nothing makes sound before a user gesture.
import { useSyncExternalStore } from "react";
import { createEngine, getEngine } from "./engine";
import { getMood, setMood, syncMusic } from "./music";
import { DEFAULT_SETTINGS, settingsStore } from "./settings";
import { SFX_NAMES, renderSfx, triggerSfx } from "./sfx";
import type { AudioSettings, MusicMood, SfxName } from "./types";

export type { AudioSettings, MusicMood, SfxName } from "./types";
export { SFX_NAMES, renderSfx };
export { soundPrint } from "./print";
export const MUSIC_MOODS: MusicMood[] = ["off", "lobby", "think", "tension", "battle", "reveal", "results"];

let armed = false;
let watchingState = false;
const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

/** Unlocks audio on the next user gesture, so callers don't have to wire it everywhere. */
function armGestureUnlock() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const onGesture = () => {
    unlockAudio();
    if (getEngine()?.ctx.state === "running") {
      for (const type of GESTURES) window.removeEventListener(type, onGesture, true);
      armed = false;
    }
  };
  for (const type of GESTURES) window.addEventListener(type, onGesture, true);
}

export function playSfx(name: SfxName): void {
  const e = getEngine();
  if (e?.ctx.state === "running") {
    triggerSfx(name);
  } else if (e?.ctx.state === "suspended") {
    // Created by the gesture that is still being handled: play once the context resumes.
    e.ctx.resume().then(() => triggerSfx(name), () => armGestureUnlock());
  } else {
    armGestureUnlock();
  }
}

/** Switches the background music, crossfading over about a second. Remembered until audio unlocks. */
export function setMusicMood(mood: MusicMood): void {
  setMood(mood);
  if (getEngine()?.ctx.state !== "running") armGestureUnlock();
}

export const getMusicMood = getMood;

/** Call from a user gesture so browsers allow audio. */
export function unlockAudio(): void {
  const e = createEngine();
  if (!e) return;
  if (!watchingState) {
    watchingState = true;
    e.ctx.addEventListener("statechange", () => {
      if (e.ctx.state === "running") syncMusic();
    });
  }
  if (e.ctx.state === "running") syncMusic();
  else e.ctx.resume().then(syncMusic, () => armGestureUnlock());
}

const serverSettings = () => DEFAULT_SETTINGS;

export function useAudioSettings(): [AudioSettings, (patch: Partial<AudioSettings>) => void] {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, serverSettings);
  return [settings, settingsStore.set];
}
