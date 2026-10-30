import { describe, expect, test } from "vitest";
import { SONGS } from "./songs";
import { degreeToMidi, noteToMidi, parseChord, parseSteps } from "./theory";

describe("songs", () => {
  for (const song of Object.values(SONGS)) {
    describe(song.mood, () => {
      for (const section of [...song.intro, ...song.loop]) {
        test(`${section.name}: every pattern has the right number of steps and valid tokens`, () => {
          const chords = section.chords.map(parseChord);
          const steps = section.chords.length * 16;
          for (const part of section.parts) {
            if (part.kind === "melody") {
              for (const variant of part.variants) {
                if (variant === "") continue;
                const { events, length } = parseSteps(variant);
                expect(length, `${part.inst} melody`).toBe(steps);
                for (const e of events) expect(() => noteToMidi(e.token)).not.toThrow();
              }
            } else if (part.kind === "groove") {
              const { events, length } = parseSteps(part.pattern);
              expect(length, `${part.inst} groove`).toBe(16);
              for (const e of events) expect(() => degreeToMidi(e.token, chords[0]!, part.octave)).not.toThrow();
            } else if (part.kind === "drums" || part.kind === "comp") {
              expect(part.pattern, `${part.inst} ${part.kind}`).toMatch(/^[XxOo.]{16}$/);
            }
          }
        });
      }

      test("melodies stay in a playable register", () => {
        for (const section of [...song.intro, ...song.loop]) {
          for (const part of section.parts) {
            if (part.kind !== "melody") continue;
            for (const variant of part.variants) {
              for (const e of parseSteps(variant).events) {
                const midi = noteToMidi(e.token);
                expect(midi).toBeGreaterThanOrEqual(noteToMidi("A4"));
                expect(midi).toBeLessThanOrEqual(noteToMidi("C7"));
              }
            }
          }
        }
      });

      test("every instrument has a mix channel", () => {
        const used = new Set([...song.intro, ...song.loop].flatMap((s) => s.parts.map((p) => p.inst)));
        for (const inst of used) expect(song.mix[inst], inst).toBeDefined();
      });
    });
  }
});
