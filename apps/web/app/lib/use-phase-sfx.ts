import { useEffect, useRef } from "react";
import { playSfx, type SfxName } from "./audio";

/** Plays a sound whenever `key` changes after the first render (a new phase, round, reveal). */
export function useChangeSfx(
  key: string | number | null | undefined,
  sound: SfxName | ((key: string | number) => SfxName | null),
) {
  const previous = useRef(key);
  useEffect(() => {
    const changed = previous.current !== key;
    previous.current = key;
    if (!changed || key === null || key === undefined) return;
    const name = typeof sound === "function" ? sound(key) : sound;
    if (name) playSfx(name);
  }, [key, sound]);
}
