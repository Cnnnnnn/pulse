/**
 * tests/main/tray-build-summary.test.js
 *
 * I7: tray 菜单顶部总览行 buildSummaryLine 纯函数测试.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { _internal } = requireMain("tray");
const { buildSummaryLine } = _internal;

const FAKE_NOW = 1750000000000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tray.buildSummaryLine — I7 顶部总览", () => {
  it('results=[] → "🔔 Pulse · 尚未检测"', () => {
    const r = buildSummaryLine([]);
    expect(r.label).toBe("🔔 Pulse · 尚未检测");
    expect(r.enabled).toBe(false);
  });

  it('results=undefined → "尚未检测"', () => {
    const r = buildSummaryLine(undefined);
    expect(r.label).toBe("🔔 Pulse · 尚未检测");
  });

  it('5 个应用, 2 待升级, 3 分钟前检测 → 显示 "5 应用 · 2 待升级 · 3m 前"', () => {
    const threeMinAgo = FAKE_NOW - 3 * 60_000;
    const results = [
      { name: "A", has_update: true, ts: threeMinAgo },
      { name: "B", has_update: true, ts: threeMinAgo },
      { name: "C", has_update: false, ts: threeMinAgo },
      { name: "D", has_update: false, ts: threeMinAgo },
      { name: "E", has_update: false, ts: threeMinAgo },
    ];
    const r = buildSummaryLine(results);
    expect(r.label).toBe("🔔 Pulse · 5 应用 · 2 待升级 · 3m 前");
    expect(r.enabled).toBe(false);
  });

  it('5 个应用, 0 待升级, 1 小时前检测 → "5 应用 · 全部最新 · 1h 前"', () => {
    const oneHourAgo = FAKE_NOW - 60 * 60_000;
    const results = Array.from({ length: 5 }, (_, i) => ({
      name: `app${i}`,
      has_update: false,
      ts: oneHourAgo,
    }));
    const r = buildSummaryLine(results);
    expect(r.label).toBe("🔔 Pulse · 5 应用 · 全部最新 · 1h 前");
  });

  it('1 个应用, ts 缺失 → "1 应用 · 全部最新" (无 age)', () => {
    const results = [{ name: "A", has_update: false }];
    const r = buildSummaryLine(results);
    expect(r.label).toBe("🔔 Pulse · 1 应用 · 全部最新");
  });

  it("ts 是 30s 前 (< 60s) → 省略 age 后缀", () => {
    const just = FAKE_NOW - 30_000;
    const results = [{ name: "A", has_update: false, ts: just }];
    const r = buildSummaryLine(results);
    expect(r.label).toBe("🔔 Pulse · 1 应用 · 全部最新");
  });

  it('混合 ts: 最早的是 1h 前, 最新 5m 前 → 显示 "1h 前"', () => {
    const oneHourAgo = FAKE_NOW - 60 * 60_000;
    const fiveMinAgo = FAKE_NOW - 5 * 60_000;
    const results = [
      { name: "old", has_update: false, ts: oneHourAgo },
      { name: "new", has_update: false, ts: fiveMinAgo },
    ];
    const r = buildSummaryLine(results);
    expect(r.label).toBe("🔔 Pulse · 2 应用 · 全部最新 · 1h 前");
  });
});

describe("tray.buildMenu — I7 集成", () => {
  it("menu 模板第一条应是 I7 summary 行", () => {
    const { buildMenu } = _internal;
    const m = buildMenu({
      results: [{ name: "A", has_update: false, ts: FAKE_NOW - 60_000 }],
      aiUsage: null,
      worldcup: null,
      metals: null,
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels[0]).toMatch(/^🔔 Pulse ·/);
    // 紧随其后是 separator
    expect(m[1].type).toBe("separator");
  });

  it('results=[] 时, 顶部 summary 显示 "尚未检测"', () => {
    const { buildMenu } = _internal;
    const m = buildMenu({ results: [] });
    expect(m[0].label).toBe("🔔 Pulse · 尚未检测");
  });
});
