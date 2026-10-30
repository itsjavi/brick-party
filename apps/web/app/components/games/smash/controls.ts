import { KEY, SmashInputQueue, type SmashInputMessage } from "@brick/game";
import { useEffect, useRef } from "react";

/**
 * Doodle Smash's controls: arrow keys (or WASD) run, jump and drop, Space attacks, B or Shift shields (not Cmd: with
 * arrows it's a browser shortcut). Phones get on-screen buttons that press the same keys.
 */

/** What a key does, by `KeyboardEvent.code`; `attack` is Space. */
export const KEYMAP: Record<string, number | "attack"> = {
  ArrowLeft: KEY.left,
  KeyA: KEY.left,
  ArrowRight: KEY.right,
  KeyD: KEY.right,
  ArrowUp: KEY.up,
  KeyW: KEY.up,
  ArrowDown: KEY.down,
  KeyS: KEY.down,
  KeyB: KEY.shield,
  ShiftLeft: KEY.shield,
  ShiftRight: KEY.shield,
  Space: "attack",
};

/** Keys held, from any source (the keyboard, on-screen buttons): each source keeps its own, and they add up. */
export class KeyState {
  #sources = new Map<string, { held: number; attack: boolean }>();

  set(source: string, held: number, attack: boolean) {
    this.#sources.set(source, { held, attack });
  }

  press(source: string, key: number | "attack", down: boolean) {
    const s = this.#sources.get(source) ?? { held: 0, attack: false };
    if (key === "attack") s.attack = down;
    else s.held = down ? s.held | key : s.held & ~key;
    this.#sources.set(source, s);
  }

  clear() {
    this.#sources.clear();
  }

  get held(): number {
    let held = 0;
    for (const s of this.#sources.values()) held |= s.held;
    return held;
  }

  get attack(): boolean {
    for (const s of this.#sources.values()) if (s.attack) return true;
    return false;
  }
}

/** How on-screen buttons tell the controls that keys changed. */
const keyState = new WeakMap<KeyState, () => void>();

/** Whether a key event belongs to a text field (chat), which keeps its keys. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Listens to the keyboard while `active`, and sends the keys held as input messages through `send`, within the room's
 * limits (`SmashInputQueue`). `onKeys` hears every change at once, to move your fighter on this screen. Returns the
 * key state, for on-screen buttons to press too.
 */
export function useSmashControls(
  active: boolean,
  send: (message: SmashInputMessage) => void,
  onKeys: (held: number, attack: boolean) => void,
): KeyState {
  const keys = useRef(new KeyState()).current;
  const queue = useRef(new SmashInputQueue()).current;
  const latest = useRef({ send, onKeys });
  latest.current = { send, onKeys };

  useEffect(() => {
    if (!active) return;
    queue.reset();
    keys.clear();
    const flush = () => {
      const message = queue.take(performance.now());
      if (message) latest.current.send(message);
    };
    const changed = () => {
      latest.current.onKeys(keys.held, keys.attack);
      queue.set(keys.held, keys.attack);
      flush();
    };
    const key = (down: boolean) => (event: KeyboardEvent) => {
      // Browser shortcuts keep their keys; letting go always counts, so nothing stays stuck down.
      if (typing(event.target) || (down && (event.metaKey || event.ctrlKey || event.altKey))) return;
      const what = KEYMAP[event.code];
      if (what === undefined) return;
      event.preventDefault();
      if (down && event.repeat) return;
      keys.press("keyboard", what, down);
      changed();
    };
    const down = key(true);
    const up = key(false);
    // Letting go of everything when the window loses focus, so no key stays stuck down.
    const blur = () => {
      keys.clear();
      changed();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    // Changes that came too soon after the last message go out as soon as they may.
    const timer = setInterval(flush, 30);
    keyState.set(keys, changed);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      clearInterval(timer);
      keyState.delete(keys);
    };
  }, [active]);
  return keys;
}

/** Presses or lets go of a key from an on-screen button. */
export function pressButton(keys: KeyState, button: string, key: number | "attack", down: boolean) {
  keys.press(`touch:${button}`, key, down);
  keyState.get(keys)?.();
}
