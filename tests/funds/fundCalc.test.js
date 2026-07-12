// tests/funds/fundCalc.test.js
// 阶段 A (P0): rowWithMetrics 派生 holdingDays / cumulativeProfit / annualizedPct
import { describe, it, expect } from "vitest";
import { rowWithMetrics } from "../../src/funds/fundCalc.js";

// 构造一个持仓 + 净值快照, 让 calcFundMetrics 算出 marketValue=130, costValue=100
const HOLDING = { code: "000001", name: "测试基金", shares: 100, costNav: 1.0 };
const NAV = { nav: 1.3 };

describe("rowWithMetrics · 派生字段 (阶段 A)", () => {
  it("holdingDays: 满 365 天 → 365", () => {
    const addedAt = new Date(Date.now() - 365 * 86400000).toISOString();
    const m = rowWithMetrics({ holding: { ...HOLDING, addedAt }, navSnap: NAV }).metrics;
    expect(m.holdingDays).toBe(365);
  });

  it("holdingDays: 不足 1 天 → 0 (今日建仓)", () => {
    const addedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const m = rowWithMetrics({ holding: { ...HOLDING, addedAt }, navSnap: NAV }).metrics;
    expect(m.holdingDays).toBe(0);
  });

  it("holdingDays: addedAt 缺失 → 0", () => {
    const m = rowWithMetrics({ holding: HOLDING, navSnap: NAV }).metrics;
    expect(m.holdingDays).toBe(0);
  });

  it("cumulativeProfit = marketValue - costValue", () => {
    const addedAt = new Date(Date.now() - 365 * 86400000).toISOString();
    const m = rowWithMetrics({ holding: { ...HOLDING, addedAt }, navSnap: NAV }).metrics;
    expect(m.cumulativeProfit).toBeCloseTo(30, 2); // 130 - 100
  });

  it("cumulativeProfit: navSnap 缺失 → marketValue=0 → -costValue", () => {
    const addedAt = new Date(Date.now() - 365 * 86400000).toISOString();
    const m = rowWithMetrics({ holding: { ...HOLDING, addedAt }, navSnap: null }).metrics;
    expect(m.cumulativeProfit).toBeCloseTo(-100, 2);
  });

  it("annualizedPct: 已知 成本/市值/天数 与手算一致 (满 365 天简单年化)", () => {
    const addedAt = new Date(Date.now() - 365 * 86400000).toISOString();
    const m = rowWithMetrics({ holding: { ...HOLDING, addedAt }, navSnap: NAV }).metrics;
    // (130/100)^(365/365) - 1 = 0.3 → 30 (%)
    expect(m.annualizedPct).toBeCloseTo(30, 2);
  });

  it("annualizedPct: 成本 0 → null (不抛错)", () => {
    const addedAt = new Date(Date.now() - 365 * 86400000).toISOString();
    const m = rowWithMetrics({
      holding: { ...HOLDING, costNav: 0 },
      navSnap: NAV,
    }).metrics;
    expect(m.annualizedPct).toBeNull();
  });

  it("annualizedPct: 持有 0 天 → null (不抛错)", () => {
    const addedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const m = rowWithMetrics({ holding: { ...HOLDING, addedAt }, navSnap: NAV }).metrics;
    expect(m.annualizedPct).toBeNull();
  });
});
