import { describe, it, expect } from "vitest";
import {
  computeMarketOverview,
  medianOf,
  percentileOf,
} from "../../src/stocks/market-overview";

describe("medianOf", () => {
  it("returns null for empty", () => {
    expect(medianOf([])).toBe(null);
  });
  it("returns single value", () => {
    expect(medianOf([5])).toBe(5);
  });
  it("odd length returns middle", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });
  it("even length returns avg of middle two", () => {
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });
  it("filters non-numbers and nulls", () => {
    expect(medianOf([1, null, 3, "x", 5])).toBe(3);
  });
});

describe("percentileOf", () => {
  it("returns null for empty", () => {
    expect(percentileOf([], 50)).toBe(null);
  });
  it("p=0 returns min, p=100 returns max", () => {
    expect(percentileOf([1, 5, 3], 0)).toBe(1);
    expect(percentileOf([1, 5, 3], 100)).toBe(5);
  });
  it("p=50 of [1,2,3,4,5] = 3", () => {
    expect(percentileOf([1, 2, 3, 4, 5], 50)).toBe(3);
  });
});

describe("computeMarketOverview", () => {
  it("returns nulls + total=0 for empty rows", () => {
    const o = computeMarketOverview([]);
    expect(o.total).toBe(0);
    expect(o.peMedian).toBe(null);
    expect(o.roeMedian).toBe(null);
    expect(o.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("null pe does not break median", () => {
    const o = computeMarketOverview([{ pe: 10 }, { pe: null }, { pe: 30 }]);
    expect(o.total).toBe(3);
    // null 过滤后剩 [10, 30], 中位 = (10+30)/2 = 20
    expect(o.peMedian).toBe(20);
  });

  it("single row uses that row's value", () => {
    const o = computeMarketOverview([
      { pe: 12, roe: 18, changePct: 2, turnover: 1.5 },
    ]);
    expect(o.peMedian).toBe(12);
    expect(o.roeMedian).toBe(18);
    expect(o.changePctMedian).toBe(2);
    expect(o.turnoverMedian).toBe(1.5);
  });

  it("hash changes when peMedian changes", () => {
    const a = computeMarketOverview([{ pe: 10 }, { pe: 20 }]);
    const b = computeMarketOverview([{ pe: 10 }, { pe: 30 }]);
    expect(a.hash).not.toBe(b.hash);
  });

  it("hash stable for same inputs", () => {
    const a = computeMarketOverview([{ pe: 10 }, { pe: 20 }]);
    const b = computeMarketOverview([{ pe: 10 }, { pe: 20 }]);
    expect(a.hash).toBe(b.hash);
  });

  it("computes PE P30 and P70 percentiles", () => {
    const rows = [];
    for (let i = 1; i <= 10; i++) rows.push({ pe: i * 10 });
    const o = computeMarketOverview(rows);
    expect(o.peP30).toBeGreaterThanOrEqual(30);
    expect(o.peP30).toBeLessThanOrEqual(40);
    expect(o.peP70).toBeGreaterThanOrEqual(70);
    expect(o.peP70).toBeLessThanOrEqual(80);
  });
});
