import { useEffect } from "react";
import { setMusicMood, unlockAudio, type MusicMood } from "./audio";

/** Plays a music mood while the calling screen is shown. `null` leaves the current music alone. */
export function useMusic(mood: MusicMood | null) {
  useEffect(() => {
    if (mood) setMusicMood(mood);
  }, [mood]);
}

/** Browsers only allow audio after a user gesture: unlock on the first one. */
export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}
