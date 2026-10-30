import { describe, expect, test, vi } from "vitest";
import { MessageBucket, Throttle, clientIp, underLimit } from "./limits";

describe("MessageBucket", () => {
  test("allows a burst, then refills over time", () => {
    const bucket = new MessageBucket(2, 3, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(250)).toBe(false);
    expect(bucket.take(500)).toBe(true);
  });

  test("never stores more than the burst", () => {
    const bucket = new MessageBucket(10, 2, 0);
    const taken = [0, 1, 2].map(() => bucket.take(60_000));
    expect(taken).toEqual([true, true, false]);
  });
});

describe("underLimit", () => {
  test("lets everything through without a binding", async () => {
    expect(await underLimit(undefined, "ip")).toBe(true);
  });

  test("follows the binding's verdict", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    expect(await underLimit(limiter, "create-player:1.2.3.4")).toBe(false);
    expect(limiter.limit).toHaveBeenCalledWith({ key: "create-player:1.2.3.4" });
  });

  test("fails open when the binding errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = { limit: vi.fn(async () => Promise.reject(new Error("down"))) };
    expect(await underLimit(limiter, "ip")).toBe(true);
  });
});

test("clientIp reads Cloudflare's header", () => {
  expect(clientIp(new Request("https://x", { headers: { "cf-connecting-ip": "203.0.113.7" } }))).toBe("203.0.113.7");
  expect(clientIp(new Request("https://x"))).toBe("local");
});

describe("Throttle", () => {
  test("runs at once, then at most once per interval, with one trailing run for the requests in between", () => {
    vi.useFakeTimers({ now: 10_000 });
    const run = vi.fn();
    const throttle = new Throttle(125, run);
    throttle.request();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(40);
    throttle.request();
    throttle.request();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(84);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
    // Quiet for longer than the interval: the next request goes at once.
    vi.advanceTimersByTime(500);
    throttle.request();
    expect(run).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  test("a new interval applies to the next run", () => {
    vi.useFakeTimers({ now: 10_000 });
    const run = vi.fn();
    const throttle = new Throttle(125, run);
    throttle.request();
    throttle.every(66);
    vi.advanceTimersByTime(66);
    throttle.request();
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("an urgent request runs at once and replaces the waiting run", () => {
    vi.useFakeTimers({ now: 10_000 });
    const run = vi.fn();
    const throttle = new Throttle(125, run);
    throttle.request();
    vi.advanceTimersByTime(10);
    throttle.request();
    throttle.request(true);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    throttle.request();
    vi.advanceTimersByTime(1);
    throttle.request();
    throttle.cancel();
    vi.advanceTimersByTime(1_000);
    expect(run).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
