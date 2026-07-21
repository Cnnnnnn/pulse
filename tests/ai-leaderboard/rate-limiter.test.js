import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  AA_DAILY_LIMIT,
  acquire,
  budget,
  remaining,
  resetLimiter,
} = require("../../src/main/ai-leaderboard/rate-limiter");

describe("rate-limiter: budget()", () => {
  beforeEach(() => resetLimiter());

  it("初始状态：AA 预算 0 used / 1000 limit / 1000 remaining / dayResetsAt 是 ISO / lastAcquireAt null", () => {
    const snapshot = budget("artificial-analysis");

    expect(snapshot.used).toBe(0);
    expect(snapshot.limit).toBe(1000);
    expect(snapshot.remaining).toBe(1000);
    expect(new Date(snapshot.dayResetsAt).toISOString()).toBe(snapshot.dayResetsAt);
    expect(snapshot.lastAcquireAt).toBeNull();
  });

  it("acquire AA 一次后 used=1 / remaining=999 / lastAcquireAt 是 ISO", () => {
    expect(acquire("artificial-analysis")).toBe(true);

    const snapshot = budget("artificial-analysis");
    expect(snapshot.used).toBe(1);
    expect(snapshot.remaining).toBe(999);
    expect(new Date(snapshot.lastAcquireAt).toISOString()).toBe(snapshot.lastAcquireAt);
  });

  it("non-AA source：used=0 / limit=Infinity / remaining=Infinity / dayResetsAt=null / lastAcquireAt=null", () => {
    expect(budget("openrouter")).toEqual({
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      dayResetsAt: null,
      lastAcquireAt: null,
    });
  });
});

describe("rate-limiter: 跨日 / 极限 / remaining 等价", () => {
  beforeEach(() => {
    resetLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("跨 UTC 日界：23:59:59 用 2 次，第二天 00:00:01 自动归零", () => {
    vi.setSystemTime(new Date("2026-07-21T23:59:59Z"));

    expect(acquire("artificial-analysis")).toBe(true);
    expect(acquire("artificial-analysis")).toBe(true);
    expect(budget("artificial-analysis").used).toBe(2);

    vi.setSystemTime(new Date("2026-07-22T00:00:01Z"));

    const snapshot = budget("artificial-analysis");
    expect(snapshot.used).toBe(0);
    expect(snapshot.lastAcquireAt).toBeNull();
  });

  it("用满 AA_DAILY_LIMIT 后 acquire 返 false", () => {
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));

    for (let i = 0; i < AA_DAILY_LIMIT; i++) {
      expect(acquire("artificial-analysis")).toBe(true);
    }

    expect(acquire("artificial-analysis")).toBe(false);

    const snapshot = budget("artificial-analysis");
    expect(snapshot.used).toBe(AA_DAILY_LIMIT);
    expect(snapshot.remaining).toBe(0);
  });

  it("remaining('artificial-analysis') ≡ budget('artificial-analysis').remaining", () => {
    expect(remaining("artificial-analysis")).toBe(
      budget("artificial-analysis").remaining,
    );

    acquire("artificial-analysis");
    acquire("artificial-analysis");

    expect(remaining("artificial-analysis")).toBe(
      budget("artificial-analysis").remaining,
    );
  });
});
