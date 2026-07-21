import { beforeEach, describe, expect, it } from "vitest";

const {
  acquire,
  budget,
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
