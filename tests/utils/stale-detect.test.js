/**
 * tests/utils/stale-detect.test.js
 *
 * 纯函数测试: 7 天阈值 + boundary (空 / 0 / > 0).
 */
import { describe, it, expect } from "vitest";
import {
  detectStaleApps,
  DEFAULT_STALE_DAYS,
} from "../../src/utils/stale-detect.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // 固定 now 让断言可重现

describe("detectStaleApps", () => {
  it("stateApps 为 null / undefined / 空 → 返空", () => {
    expect(detectStaleApps(null, NOW)).toEqual({
      staleNames: [],
      staleCount: 0,
      freshestTs: 0,
    });
    expect(detectStaleApps(undefined, NOW)).toEqual({
      staleNames: [],
      staleCount: 0,
      freshestTs: 0,
    });
    expect(detectStaleApps({}, NOW)).toEqual({
      staleNames: [],
      staleCount: 0,
      freshestTs: 0,
    });
  });

  it("thresholdDays <= 0 → 禁用 stale (返空, 但 freshestTs 仍算)", () => {
    const apps = { foo: { ts: NOW - 30 * MS_PER_DAY, status: "ok" } };
    const r = detectStaleApps(apps, NOW, 0);
    expect(r.staleCount).toBe(0);
    expect(r.staleNames).toEqual([]);
    // freshestTs 仍然记录
    expect(r.freshestTs).toBe(NOW - 30 * MS_PER_DAY);
  });

  it("status=error 视为失败, 不进 staleNames (避免误报)", () => {
    const apps = {
      foo: { ts: NOW - 30 * MS_PER_DAY, status: "error" },
    };
    const r = detectStaleApps(apps, NOW);
    expect(r.staleCount).toBe(0);
    expect(r.freshestTs).toBe(0);
  });

  it("ts=0 / 缺 ts → 视为从未成功", () => {
    const apps = { foo: { status: "ok" } };
    const r = detectStaleApps(apps, NOW);
    expect(r.staleCount).toBe(0);
    expect(r.freshestTs).toBe(0);
  });

  it("8 天前成功 → stale; 5 天前成功 → fresh (默认 7 天阈值)", () => {
    const apps = {
      a: { ts: NOW - 8 * MS_PER_DAY, status: "ok" },
      b: { ts: NOW - 5 * MS_PER_DAY, status: "ok" },
    };
    const r = detectStaleApps(apps, NOW);
    expect(r.staleNames).toEqual(["a"]);
    expect(r.staleCount).toBe(1);
    expect(r.freshestTs).toBe(NOW - 5 * MS_PER_DAY);
  });

  it("边界: 恰好 7 天整 → 不算 stale (严格大于)", () => {
    const apps = { a: { ts: NOW - 7 * MS_PER_DAY, status: "ok" } };
    const r = detectStaleApps(apps, NOW);
    expect(r.staleCount).toBe(0);
  });

  it("边界: 7 天 + 1ms → stale", () => {
    const apps = { a: { ts: NOW - 7 * MS_PER_DAY - 1, status: "ok" } };
    const r = detectStaleApps(apps, NOW);
    expect(r.staleCount).toBe(1);
  });

  it("自定义 threshold 生效", () => {
    const apps = { a: { ts: NOW - 3 * MS_PER_DAY, status: "ok" } };
    expect(detectStaleApps(apps, NOW, 2).staleCount).toBe(1);
    expect(detectStaleApps(apps, NOW, 5).staleCount).toBe(0);
  });

  it("now 不传 → 用 Date.now() (smoke test)", () => {
    const apps = { a: { ts: Date.now(), status: "ok" } };
    const r = detectStaleApps(apps);
    expect(r.staleCount).toBe(0);
  });

  it("DEFAULT_STALE_DAYS 默认 7 (回归)", () => {
    expect(DEFAULT_STALE_DAYS).toBe(7);
  });

  it("混合: 多个 stale + fresh + error", () => {
    const apps = {
      a: { ts: NOW - 10 * MS_PER_DAY, status: "ok" }, // stale
      b: { ts: NOW - 8 * MS_PER_DAY, status: "ok" }, // stale
      c: { ts: NOW - 1 * MS_PER_DAY, status: "ok" }, // fresh
      d: { ts: NOW - 10 * MS_PER_DAY, status: "error" }, // 失败不算
      e: { ts: 0, status: "ok" }, // 从未成功
    };
    const r = detectStaleApps(apps, NOW);
    expect(r.staleNames.sort()).toEqual(["a", "b"]);
    expect(r.staleCount).toBe(2);
    expect(r.freshestTs).toBe(NOW - 1 * MS_PER_DAY);
  });
});
