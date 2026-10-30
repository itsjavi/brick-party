import type { MatchView } from "@brick/game";
import { describe, expect, test } from "vitest";
import { AutopilotMemory } from "./autopilot";

const playing = (step: number) =>
  ({
    phase: "playing",
    index: 0,
    game: { gameId: "skip-logic", players: [], view: { phase: "draw", step }, deadline: null },
  }) as unknown as MatchView;
const lobby = { phase: "lobby", index: 0, game: null } as unknown as MatchView;

describe("AutopilotMemory", () => {
  test("acts once per bot and moment", () => {
    const memory = new AutopilotMemory();
    expect(memory.once("Bea", playing(1), "draw")).toBe(true);
    expect(memory.once("Bea", playing(1), "draw")).toBe(false);
    expect(memory.once("Cal", playing(1), "draw")).toBe(true);
    expect(memory.once("Bea", playing(3), "draw")).toBe(true);
  });

  test("acts again in a repeated game once the room is back in the lobby", () => {
    const memory = new AutopilotMemory();
    expect(memory.once("Bea", playing(1), "draw")).toBe(true);
    memory.see(playing(1));
    expect(memory.once("Bea", playing(1), "draw")).toBe(false);
    memory.see(lobby);
    expect(memory.once("Bea", playing(1), "draw")).toBe(true);
  });

  test("keeps a bot's chosen moment until the next match", () => {
    const memory = new AutopilotMemory();
    expect(memory.dueAt("Bea", playing(0), () => 5)).toBe(5);
    expect(memory.dueAt("Bea", playing(0), () => 9)).toBe(5);
    memory.see(lobby);
    expect(memory.dueAt("Bea", playing(0), () => 9)).toBe(9);
  });
});
