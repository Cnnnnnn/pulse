/**
 * tests/main/fund-nav-merge.test.js
 */

import { describe, it, expect } from "vitest";
const {
  attachAltNav,
  resolveNavSnapshot,
  pickEffectiveNavNumber,
  normalizeNavSource,
} = require("../../src/funds/fund-nav-merge.js");

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
    nav: 4.672,
    estimatedNav: 4.682,
    dayChangePct: -0.21,
  };

  it("合并新浪数据并计算偏差", () => {
    const m = attachAltNav(primary, alt);
    expect(m.altAvailable).toBe(true);
    expect(m.altEstimatedNav).toBe(4.682);
    expect(m.estimateDeviationPct).toBeCloseTo(1.0493, 2);
    expect(m.estimateDeviationHigh).toBe(true);
  });

  it("新浪失败 → 仅标记不可用", () => {
    const m = attachAltNav(primary, null);
    expect(m.altAvailable).toBe(false);
    expect(m.nav).toBe(4.672);
  });
});

describe("resolveNavSnapshot", () => {
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
    altEstimatedNav: 4.682,
    altDayChangePct: -0.21,
  };

  it("天天 → 主源字段", () => {
    const s = resolveNavSnapshot(merged, "tiantian");
    expect(s.source).toBe("tiantian");
    expect(s.estimatedNav).toBe(4.7317);
  });

  it("新浪 → 备源字段", () => {
    const s = resolveNavSnapshot(merged, "sina");
    expect(s.source).toBe("sina");
    expect(s.estimatedNav).toBe(4.682);
    expect(s.dayChange).toBeCloseTo(0.01, 3);
  });

  it("新浪不可用 → null", () => {
    expect(
      resolveNavSnapshot({ ...merged, altAvailable: false }, "sina"),
    ).toBeNull();
  });

  it("pickEffectiveNavNumber 优先估值", () => {
    expect(pickEffectiveNavNumber(merged, "sina")).toBe(4.682);
  });

  it("normalizeNavSource 非法值回退", () => {
    expect(normalizeNavSource("nope")).toBe("tiantian");
  });
});
