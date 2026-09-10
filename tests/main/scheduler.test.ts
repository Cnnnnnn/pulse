/**
 * tests/main/scheduler.test.ts
 *
 * 命名任务调度服务：start/stop/list + 同名覆盖 + 无效入参拒绝。
 * 不用 fake timers — timer-registry 绑的是 node:timers，fake 钩不住。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

const {
  startJob,
  stopJob,
  restartJob,
  isJobRunning,
  listJobs,
  stopAllJobs,
  __resetForTest,
} = requireMain("scheduler");

const { __resetForTest: resetTimers } = requireMain("timer-registry");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
  __resetForTest();
  resetTimers();
});

afterEach(() => {
  stopAllJobs();
});

describe("scheduler service", () => {
  it("startJob 立即跑一次并按 interval 周期触发", async () => {
    const fn = vi.fn();
    expect(startJob({ name: "t1", intervalMs: 30, fn })).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    await sleep(100);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("initialDelayMs 延迟首跑", async () => {
    const fn = vi.fn();
    startJob({ name: "t2", intervalMs: 50, initialDelayMs: 40, fn });
    expect(fn).toHaveBeenCalledTimes(0);
    await sleep(20);
    expect(fn).toHaveBeenCalledTimes(0);
    await sleep(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stopJob 停止周期并 isJobRunning=false", async () => {
    const fn = vi.fn();
    startJob({ name: "t3", intervalMs: 30, fn });
    expect(isJobRunning("t3")).toBe(true);
    expect(stopJob("t3")).toBe(true);
    expect(isJobRunning("t3")).toBe(false);
    const n = fn.mock.calls.length;
    await sleep(80);
    expect(fn.mock.calls.length).toBe(n);
  });

  it("同名 start 覆盖旧任务，不双跑", async () => {
    const a = vi.fn();
    const b = vi.fn();
    startJob({ name: "dup", intervalMs: 30, fn: a });
    startJob({ name: "dup", intervalMs: 30, fn: b });
    await sleep(80);
    expect(a).toHaveBeenCalledTimes(1); // 只有第一次立即 fire
    expect(b.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("invalid spec 拒绝", () => {
    expect(startJob({ name: "", intervalMs: 1000, fn: () => {} })).toBe(false);
    expect(startJob({ name: "x", intervalMs: 0, fn: () => {} })).toBe(false);
    expect(
      startJob({ name: "x", intervalMs: 1000, fn: null as any }),
    ).toBe(false);
  });

  it("listJobs / restartJob / stopAllJobs", async () => {
    const fn = vi.fn();
    startJob({ name: "a", intervalMs: 50, fn });
    startJob({ name: "b", intervalMs: 80, fn });
    expect(listJobs().map((j) => j.name).sort()).toEqual(["a", "b"]);
    restartJob({ name: "a", intervalMs: 50, fn });
    expect(isJobRunning("a")).toBe(true);
    expect(stopAllJobs()).toBe(2);
    expect(listJobs()).toHaveLength(0);
  });

  it("任务抛错不拖垮调度循环", async () => {
    let n = 0;
    startJob({
      name: "boom",
      intervalMs: 30,
      fn: () => {
        n += 1;
        throw new Error("boom");
      },
    });
    await sleep(100);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(isJobRunning("boom")).toBe(true);
  });
});
