import { describe, expect, test } from "vitest";
import { EventFeed, needsState } from "./feed";

describe("EventFeed", () => {
  test("hands over lines that came before the call at once", async () => {
    const feed = new EventFeed();
    feed.push("[ready] 3 bots are in room ABCD");
    feed.push("[lobby] waiting");
    expect(await feed.next(1000, 0)).toEqual(["[ready] 3 bots are in room ABCD", "[lobby] waiting"]);
  });

  test("waits for the next line and gathers the rest of its batch", async () => {
    const feed = new EventFeed();
    const batch = feed.next(1000, 50);
    setTimeout(() => feed.push("[turn] vote"), 10);
    setTimeout(() => feed.push("[chat] Javi: hi"), 20);
    expect(await batch).toEqual(["[turn] vote", "[chat] Javi: hi"]);
  });

  test("gives nothing when the wait runs out, and each line only once", async () => {
    const feed = new EventFeed();
    expect(await feed.next(20, 0)).toEqual([]);
    feed.push("[break] standings");
    expect(await feed.next(20, 0)).toEqual(["[break] standings"]);
    expect(await feed.next(20, 0)).toEqual([]);
  });
});

describe("needsState", () => {
  test("only for lines a bot might act on", () => {
    expect(needsState(["[intro] Bot or Not is next", "[auto] Bea ran out of time"])).toBe(false);
    expect(needsState(["[stopped] the bots left"])).toBe(false);
    expect(needsState(["[intro] next", "[turn] answer · to act: Bea"])).toBe(true);
    expect(needsState(["[chat] Javi: hi"])).toBe(true);
  });
});
