import { describe, expect, test } from "vitest";
import { VOWELS, botNotes, crowdVoices, formantQ, laughSyllables } from "./formants";
import { seeded } from "./theory";

describe("vowel formants", () => {
  test("each vowel has three ascending formants with sane Q and the first loudest", () => {
    for (const [vowel, formants] of Object.entries(VOWELS)) {
      expect(formants, vowel).toHaveLength(3);
      for (let i = 1; i < formants.length; i++) expect(formants[i]!.freq).toBeGreaterThan(formants[i - 1]!.freq);
      for (const f of formants) {
        expect(formantQ(f)).toBeGreaterThan(1);
        expect(formantQ(f)).toBeLessThan(40);
        expect(f.gain).toBeLessThanOrEqual(formants[0]!.gain);
      }
    }
  });

  test("darker vowels have lower first formants (a > o > u)", () => {
    expect(VOWELS.a[0]!.freq).toBeGreaterThan(VOWELS.o[0]!.freq);
    expect(VOWELS.o[0]!.freq).toBeGreaterThan(VOWELS.u[0]!.freq);
  });
});

describe("reaction shapes", () => {
  test("laugh syllables are spaced, short, and fall in pitch", () => {
    const syllables = laughSyllables(4, seeded(1));
    expect(syllables).toHaveLength(4);
    for (let i = 0; i < syllables.length; i++) {
      const s = syllables[i]!;
      expect(s.to).toBeLessThan(s.from);
      expect(s.dur).toBeGreaterThan(0.05);
      expect(s.dur).toBeLessThan(0.15);
      if (i > 0) {
        const prev = syllables[i - 1]!;
        expect(s.offset).toBeGreaterThan(prev.offset + prev.dur);
        expect(s.from).toBeLessThan(prev.from * 1.05);
      }
    }
    const last = syllables.at(-1)!;
    expect(last.offset + last.dur).toBeLessThan(0.75);
  });

  test("the booing crowd stays in the low voice range, staggered and spread", () => {
    const voices = crowdVoices(6, seeded(2));
    expect(voices).toHaveLength(6);
    for (const v of voices) {
      expect(v.f0).toBeGreaterThanOrEqual(110);
      expect(v.f0).toBeLessThanOrEqual(160);
      expect(v.delay).toBeLessThan(0.1);
      expect(v.drop).toBeGreaterThan(0);
      expect(Math.abs(v.pan)).toBeLessThanOrEqual(0.6);
    }
    expect(voices[0]!.pan).toBeLessThan(voices.at(-1)!.pan);
    expect(new Set(voices.map((v) => v.f0)).size).toBe(6);
  });

  test("robot bleeps stay in range and never repeat a note back to back", () => {
    const notes = botNotes(20, seeded(3), 84);
    expect(notes).toHaveLength(20);
    for (let i = 0; i < notes.length; i++) {
      expect(notes[i]).toBeGreaterThanOrEqual(84);
      expect(notes[i]).toBeLessThan(84 + 24);
      if (i > 0) expect(notes[i]).not.toBe(notes[i - 1]);
    }
  });
});
