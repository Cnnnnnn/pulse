const { requireMain, requirePlatform, requireUtils, requireConfig, requireDetector, requireMetals, requireFunds, requireStocks, requireAi, requireAiSessions, requireAiUsage, requireWorkers, requireReleaseNotes } = require("../_setup/require-main.cjs");

/**
 * tests/main/fund-nav-merge.test.js
 */

import { describe, it, expect } from "vitest";
const {
  attachAltNav,
  resolveNavSnapshot,
  pickEffectiveNavNumber,
  normalizeNavSource,
} = requireFunds("fund-nav-merge");

describe("attachAltNav", () => {
  const primary = {
    code: "021528",
    source: "tiantian",
    nav: 4.672,
    estimatedNav: 4.7317,
    dayChangePct: 1.28,
  };

  const alt = {
    code: "021528",
    source: "sina",
    nav: 4.672, // 新浪今日单位净值
    estimatedNav: null, // 新浪 of 接口无盘中估算净值
    dayChangePct: -0.21,
  };

  it("合并新浪数据并计算偏差", () => {
    const m = attachAltNav(primary, alt);
    expect(m.altAvailable).toBe(true);
    // 新浪无估算净值 → altEstimatedNav=null, 偏差用新浪 nav 兜底 (effectiveEstimate)
    expect(m.altEstimatedNav).toBeNull();
    expect(m.estimateDeviationPct).toBeCloseTo(1.2617, 2);
    expect(m.estimateDeviationHigh).toBe(true);
  });

  it("新浪失败 → 仅标记不可用", () => {
    const m = attachAltNav(primary, null);
    expect(m.altAvailable).toBe(false);
    expect(m.nav).toBe(4.672);
  });
});

describe("resolveNavSnapshot", () => {
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const merged = {
    code: "021528",
    name: "x",
    nav: 4.672,
    estimatedNav: 4.7317,
    dayChange: 0.0597,
    dayChangePct: 1.28,
    estimated: true,
    altAvailable: true,
    altNav: 4.672,
    altEstimatedNav: null, // 新浪无盘中估算净值
    altDayChangePct: -0.21,
    altNavDate: todayStr,
  };

  it("天天 → 主源字段", () => {
    const s = resolveNavSnapshot(merged, "tiantian");
    expect(s.source).toBe("tiantian");
    expect(s.estimatedNav).toBe(4.7317);
  });

  it("新浪 → 备源字段 (dayChange 由官方涨跌幅反推, 不反转)", () => {
    const s = resolveNavSnapshot(merged, "sina");
    expect(s.source).toBe("sina");
    expect(s.estimatedNav).toBeNull(); // 新浪无估算净值
    expect(s.nav).toBe(4.672);
    // 官方涨跌幅 -0.21% → dayChange 必须为负 (今日是跌的)
    // 旧逻辑 estimatedNav-nav 会把上日净值当估算 → +0.01 错误反转
    expect(s.dayChange).toBeCloseTo(-0.0098, 3);
    expect(s.dayChangePct).toBe(-0.21);
  });

  it("新浪 estimated: altNavDate=今天 → true (当日数据)", () => {
    const s = resolveNavSnapshot(
      { ...merged, altNavDate: todayStr },
      "sina",
    );
    expect(s.estimated).toBe(true);
  });

  it("新浪 estimated: altNavDate=昨天 → false (周末/节假日旧数据不当今日)", () => {
    const s = resolveNavSnapshot(
      { ...merged, altNavDate: "2020-01-01" },
      "sina",
    );
    expect(s.estimated).toBe(false);
  });

  it("新浪不可用 → null", () => {
    expect(
      resolveNavSnapshot({ ...merged, altAvailable: false }, "sina"),
    ).toBeNull();
  });

  it("pickEffectiveNavNumber 新浪无估算 → 用 nav", () => {
    expect(pickEffectiveNavNumber(merged, "sina")).toBe(4.672);
  });

  it("normalizeNavSource 非法值回退", () => {
    expect(normalizeNavSource("nope")).toBe("tiantian");
  });
});
