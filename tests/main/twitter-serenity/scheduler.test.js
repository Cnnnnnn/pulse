/**
 * tests/main/twitter-serenity/scheduler.test.js
 *
 * Task 10: scheduler 5min poll + quiet hours (默认 23:00-07:00).
 * 用 vi.useFakeTimers 控制 setInterval; 通过 deps.nowFn 注入固定时间测 quiet hours.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScheduler } from "../../../src/main/twitter-serenity/scheduler.js";

describe("scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start 立即触发首次 fetch (非 quiet hours)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: true, tweets: [], degraded: false });
    // 注入固定中午时间, 避免 quiet hours 干扰 (deterministic)
    const noon = new Date("2026-06-22T12:00:00");
    const sched = createScheduler({
      fetchFn,
      intervalMs: 5 * 60 * 1000,
      nowFn: () => noon,
    });
    sched.start();
    await vi.advanceTimersByTimeAsync(100); // 让 microtask 跑完
    expect(fetchFn).toHaveBeenCalledTimes(1);
    sched.stop();
  });

  it("quiet hours (23:00-07:00) 首次 fetch 被跳过", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: true, tweets: [], degraded: false });
    // 固定时间为凌晨 2 点 (在 23-7 quiet hours 内)
    const fixedNight = new Date("2026-06-22T02:00:00");
    const sched = createScheduler({
      fetchFn,
      intervalMs: 5 * 60 * 1000,
      quietHours: { start: 23, end: 7 },
      nowFn: () => fixedNight,
    });
    sched.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchFn).not.toHaveBeenCalled();
    sched.stop();
  });

  it("triggerNow 跳过 quiet hours 直接触发", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const fixedNight = new Date("2026-06-22T02:00:00");
    const sched = createScheduler({
      fetchFn,
      intervalMs: 5 * 60 * 1000,
      quietHours: { start: 23, end: 7 },
      nowFn: () => fixedNight,
    });
    sched.start();
    await sched.triggerNow();
    expect(fetchFn).toHaveBeenCalled();
    sched.stop();
  });

  it("fetch 抛错被吞不中断后续 setInterval", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const noon = new Date("2026-06-22T12:00:00");
    const sched = createScheduler({
      fetchFn,
      intervalMs: 1000,
      nowFn: () => noon,
    });
    sched.start();
    await vi.advanceTimersByTimeAsync(2500); // 触发第 2 次 tick
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    sched.stop();
  });

  it("isInQuietHours 跨夜区间正确 (23-7)", () => {
    const mk = (h) => new Date(`2026-06-22T0${h}:00:00`.replace("T00", "T00"));
    const sched = createScheduler({
      fetchFn: vi.fn(),
      quietHours: { start: 23, end: 7 },
    });
    // 用具体小时构造 Date 测
    const at = (h) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return sched.isInQuietHours(d);
    };
    expect(at(2)).toBe(true);
    expect(at(6)).toBe(true);
    expect(at(7)).toBe(false); // end 是开区间
    expect(at(10)).toBe(false);
    expect(at(22)).toBe(false);
    expect(at(23)).toBe(true);
    expect(at(0)).toBe(true);
  });

  it("stop 后 clearInterval 不再触发", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const noon = new Date("2026-06-22T12:00:00");
    const sched = createScheduler({ fetchFn, intervalMs: 1000, nowFn: () => noon });
    sched.start();
    await vi.advanceTimersByTimeAsync(100);
    const callsAfterStart = fetchFn.mock.calls.length;
    sched.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn.mock.calls.length).toBe(callsAfterStart);
  });
});
