import { describe, expect, test } from "vitest";
import {
  degreeToMidi,
  midiToFreq,
  noteToMidi,
  parseChord,
  parseSteps,
  seeded,
  sliderToGain,
  stepSeconds,
  swingDelay,
  voicing,
} from "./theory";

describe("notes", () => {
  test("names map to MIDI numbers", () => {
    expect(noteToMidi("C4")).toBe(60);
    expect(noteToMidi("A4")).toBe(69);
    expect(noteToMidi("Bb5")).toBe(82);
    expect(noteToMidi("F#3")).toBe(54);
    expect(noteToMidi("C-1")).toBe(0);
    expect(() => noteToMidi("H2")).toThrow();
  });

  test("MIDI maps to equal-tempered frequencies", () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
  });
});

describe("chords", () => {
  test("parses roots and qualities", () => {
    expect(parseChord("F")).toEqual({ root: 53, intervals: [0, 4, 7] });
    expect(parseChord("Dm")).toEqual({ root: 50, intervals: [0, 3, 7] });
    expect(parseChord("Bb")).toEqual({ root: 58, intervals: [0, 4, 7] });
    expect(parseChord("A7").intervals).toEqual([0, 4, 7, 10]);
    expect(() => parseChord("Fwhatever")).toThrow();
  });

  test("voices chord tones close to a center", () => {
    expect(voicing(parseChord("F"), 65, 3)).toEqual([60, 65, 69]);
    expect(voicing(parseChord("C"), 72, 4)).toEqual([67, 72, 76, 79]);
    const tones = voicing(parseChord("Dm"), 62, 6);
    expect(tones).toHaveLength(6);
    expect([...tones].sort((a, b) => a - b)).toEqual(tones);
    for (const t of tones) expect([2, 5, 9]).toContain(t % 12);
  });

  test("degrees follow the chord quality unless altered", () => {
    const f = parseChord("F");
    const dm = parseChord("Dm");
    expect(degreeToMidi("1", f, 2)).toBe(41);
    expect(degreeToMidi("3", f, 2)).toBe(45);
    expect(degreeToMidi("3", dm, 2)).toBe(41);
    expect(degreeToMidi("5", dm, 2)).toBe(45);
    expect(degreeToMidi("8", f, 2)).toBe(53);
    expect(degreeToMidi("b7", f, 2)).toBe(51);
    expect(degreeToMidi("5,", f, 2)).toBe(36);
    expect(degreeToMidi("1'", f, 2)).toBe(53);
  });
});

describe("step patterns", () => {
  test("parses notes, rests, holds, accents and bar lines", () => {
    const { events, length } = parseSteps("C5 - - . | E5! . G5 -");
    expect(length).toBe(8);
    expect(events).toEqual([
      { step: 0, token: "C5", steps: 3, accent: false },
      { step: 4, token: "E5", steps: 1, accent: true },
      { step: 6, token: "G5", steps: 2, accent: false },
    ]);
  });
});

describe("scheduler math", () => {
  test("16th-note step length", () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
    expect(stepSeconds(60, 2)).toBeCloseTo(0.5);
  });

  test("swing delays only odd steps", () => {
    expect(swingDelay(0, 0.125, 0.2)).toBe(0);
    expect(swingDelay(1, 0.125, 0.2)).toBeCloseTo(0.025);
    expect(swingDelay(2, 0.125, 0.2)).toBe(0);
  });

  test("volume curve is silent at 0, unity at 1 and monotonic", () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(1.5)).toBe(1);
    let previous = 0;
    for (let v = 0.05; v <= 1; v += 0.05) {
      const g = sliderToGain(v);
      expect(g).toBeGreaterThan(previous);
      previous = g;
    }
  });

  test("seeded randomness is reproducible", () => {
    const a = seeded(42);
    const b = seeded(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
