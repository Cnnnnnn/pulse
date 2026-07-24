import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const _realSetTimeout = global.setTimeout;
const _realRandom = Math.random;

describe("scheduler: 第一次 triggerNow jiterr", () => {
  beforeEach(() => {
    // stub setTimeout to capture the first jiterr timeout
    global.setTimeout = vi.fn((fn, ms) => {
      global.__lastJitterMs = ms;
      return 0;
    });
  });

  afterEach(() => {
    global.setTimeout = _realSetTimeout;
    Math.random = _realRandom;
    delete global.__lastJitterMs;
  });

  it("Math.random=0 → 第一次 trigger 延迟 30 min (1800000 ms)", async () => {
    Math.random = () => 0;
    const { registerLeaderboardScheduler } = await Promise.resolve(requireMain("ai-leaderboard/scheduler"));
    const sched = registerLeaderboardScheduler();
    sched.start();
    expect(global.__lastJitterMs).toBe(30 * 60 * 1000);
    sched.stop();
  });

  it("Math.random=1 → 第一次 trigger 延迟 89-90 min (jitter 上界)", async () => {
    Math.random = () => 0.999;
    const { registerLeaderboardScheduler } = await Promise.resolve(requireMain("ai-leaderboard/scheduler"));
    const sched = registerLeaderboardScheduler();
    sched.start();
    const expected = 30 * 60 * 1000 + Math.floor(0.999 * 60 * 60 * 1000);
    expect(global.__lastJitterMs).toBe(expected);
    expect(global.__lastJitterMs).toBeGreaterThan(89 * 60 * 1000);
    sched.stop();
  });

  it("Math.random=0.5 → 延迟在 [30, 90] min 范围内", async () => {
    Math.random = () => 0.5;
    const { registerLeaderboardScheduler } = await Promise.resolve(requireMain("ai-leaderboard/scheduler"));
    const sched = registerLeaderboardScheduler();
    sched.start();
    expect(global.__lastJitterMs).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(global.__lastJitterMs).toBeLessThan(90 * 60 * 1000);
    sched.stop();
  });
});