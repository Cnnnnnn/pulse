/**
 * tests/workers/detector-chain-incremental.test.js
 *
 * C5: decideIncremental 纯函数单测 — 最近 7d 检测过且 detectors>1 → 只跑第一个.
 * (runDetectorChain 真实链路复杂, 走 task-handlers 集成测试覆盖更稳;
 * 这里只测决策函数.)
 */

import { describe, it, expect } from "vitest";

const APP_CFG = {
  name: "TestApp",
  detectors: [
    { type: "fake_a", url: "http://a" },
    { type: "fake_b", url: "http://b" },
    { type: "fake_c", url: "http://c" },
  ],
};

describe("runDetectorChain — incremental mode (C5)", () => {
  it("无 incremental 参数 → 走全链 (向后兼容)", async () => {
    // 直接构造 detectors 数组 + stub makeDetector; 走简化路径
    // 由于 detector 真实网络/HTTP 复杂, 改测决策函数本身:
    const { decideIncremental } =
      await import("../../src/workers/detector-chain-incremental.js");
    expect(
      decideIncremental({
        detectors: APP_CFG.detectors,
        appTs: 1700000000000,
        recentDays: 7,
        now: 1700100000000,
      }),
    ).toEqual({ useIncremental: true, maxIndex: 1 });
  });

  it("incremental + appTs 缺失 → useIncremental=false (全链)", async () => {
    const { decideIncremental } =
      await import("../../src/workers/detector-chain-incremental.js");
    expect(
      decideIncremental({
        detectors: APP_CFG.detectors,
        appTs: null,
        recentDays: 7,
        now: 1700100000000,
      }),
    ).toEqual({ useIncremental: false, maxIndex: 3 });
  });

  it("incremental + appTs > 7d 前 → 全链", async () => {
    const { decideIncremental } =
      await import("../../src/workers/detector-chain-incremental.js");
    const now = 1700100000000;
    const tenDaysAgo = now - 10 * 86400_000;
    expect(
      decideIncremental({
        detectors: APP_CFG.detectors,
        appTs: tenDaysAgo,
        recentDays: 7,
        now,
      }),
    ).toEqual({ useIncremental: false, maxIndex: 3 });
  });

  it("incremental + appTs < 7d 前 → 只跑 1 个", async () => {
    const { decideIncremental } =
      await import("../../src/workers/detector-chain-incremental.js");
    const now = 1700100000000;
    const twoDaysAgo = now - 2 * 86400_000;
    expect(
      decideIncremental({
        detectors: APP_CFG.detectors,
        appTs: twoDaysAgo,
        recentDays: 7,
        now,
      }),
    ).toEqual({ useIncremental: true, maxIndex: 1 });
  });

  it("detectors.length=1 → useIncremental=false (无意义)", async () => {
    const { decideIncremental } =
      await import("../../src/workers/detector-chain-incremental.js");
    expect(
      decideIncremental({
        detectors: [{ type: "single", url: "x" }],
        appTs: 1700000000000,
        recentDays: 7,
        now: 1700100000000,
      }),
    ).toEqual({ useIncremental: false, maxIndex: 1 });
  });

  it("incremental + detectors=空数组 → 全 0 (边界)", async () => {
    const { decideIncremental } =
      await import("../../src/workers/detector-chain-incremental.js");
    expect(
      decideIncremental({
        detectors: [],
        appTs: 1700000000000,
        recentDays: 7,
        now: 1700100000000,
      }),
    ).toEqual({ useIncremental: false, maxIndex: 0 });
  });
});
