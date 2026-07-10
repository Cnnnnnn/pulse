/**
 * tests/ai-usage/usage-window.test.js
 *
 * classifyUsageLevel: 把 (usedPercent, status) → 展示用 level.
 */

import { describe, test, expect } from "vitest";
const {
  classifyUsageLevel,
  LEVELS,
  TENSE_MIN_PCT,
  CRITICAL_MIN_PCT,
} = require("../../src/ai-usage/usage-window");

describe("classifyUsageLevel — 状态分级", () => {
  test("status=0 永远返回 throttled (不论百分比)", () => {
    const r = classifyUsageLevel(10, 0);
    expect(r.level).toBe("throttled");
    expect(r.label).toBe("已限流");
    expect(r.cssClass).toBe("throttled");
  });

  test("status=0 即使百分比高也是 throttled (优先级最高)", () => {
    const r = classifyUsageLevel(95, 0);
    expect(r.level).toBe("throttled");
  });

  test("status=1 + 百分比 < tenseMinPct → healthy", () => {
    const r = classifyUsageLevel(30, 1);
    expect(r.level).toBe("healthy");
    expect(r.label).toBe("健康");
    expect(r.cssClass).toBe("healthy");
  });

  test("status=1 + tenseMinPct ≤ pct < criticalMinPct → tense", () => {
    const r = classifyUsageLevel(TENSE_MIN_PCT, 1);
    expect(r.level).toBe("tense");
    const r2 = classifyUsageLevel(80, 1);
    expect(r2.level).toBe("tense");
  });

  test("status=1 + pct >= criticalMinPct → critical", () => {
    const r = classifyUsageLevel(CRITICAL_MIN_PCT, 1);
    expect(r.level).toBe("critical");
    const r2 = classifyUsageLevel(99, 1);
    expect(r2.level).toBe("critical");
  });

  test("百分比为 null/undefined → unknown", () => {
    expect(classifyUsageLevel(null, 1).level).toBe("unknown");
    expect(classifyUsageLevel(undefined, 1).level).toBe("unknown");
    expect(classifyUsageLevel(NaN, 1).level).toBe("unknown");
  });

  test("百分比 = 0 → healthy (刚开始用)", () => {
    const r = classifyUsageLevel(0, 1);
    expect(r.level).toBe("healthy");
  });

  test("百分比 = 100 → critical", () => {
    const r = classifyUsageLevel(100, 1);
    expect(r.level).toBe("critical");
  });

  test("status 缺省/null/undefined 视为正常, 按百分比分级", () => {
    expect(classifyUsageLevel(30, null).level).toBe("healthy");
    expect(classifyUsageLevel(70, undefined).level).toBe("tense");
    expect(classifyUsageLevel(90, undefined).level).toBe("critical");
  });

  test("opts.tenseMinPct / criticalMinPct 可覆盖默认阈值", () => {
    const r = classifyUsageLevel(50, 1, { tenseMinPct: 40, criticalMinPct: 70 });
    expect(r.level).toBe("tense");
    const r2 = classifyUsageLevel(75, 1, { tenseMinPct: 40, criticalMinPct: 70 });
    expect(r2.level).toBe("critical");
  });

  test("opts.criticalMinPct <= tenseMinPct 时用默认 critical", () => {
    const r = classifyUsageLevel(CRITICAL_MIN_PCT, 1, {
      tenseMinPct: 50,
      criticalMinPct: 40,
    });
    expect(r.level).toBe("critical");
  });

  test("返回 priority 字段, throttled > critical > tense > healthy > unknown", () => {
    const priorities = LEVELS.map(
      (lvl) => classifyUsageLevel(50, lvl === "throttled" ? 0 : 1).priority,
    );
    // unknown 和 healthy 取决于百分比, 这里只校验 throttled > critical
    const throttled = classifyUsageLevel(50, 0).priority;
    const critical = classifyUsageLevel(95, 1).priority;
    const tense = classifyUsageLevel(70, 1).priority;
    const healthy = classifyUsageLevel(10, 1).priority;
    expect(throttled).toBeGreaterThan(critical);
    expect(critical).toBeGreaterThan(tense);
    expect(tense).toBeGreaterThan(healthy);
  });

  test("5 个 level 都覆盖到 (穷尽)", () => {
    const seen = new Set();
    seen.add(classifyUsageLevel(null, null).level);
    seen.add(classifyUsageLevel(10, 1).level);
    seen.add(classifyUsageLevel(70, 1).level);
    seen.add(classifyUsageLevel(95, 1).level);
    seen.add(classifyUsageLevel(50, 0).level);
    expect(seen.size).toBe(5);
    for (const lvl of seen) expect(LEVELS).toContain(lvl);
  });
});