import { describe, it, expect } from "vitest";
import { computeStockCacheKey } from "../../src/stocks/stock-detail-cache";

describe("computeStockCacheKey", () => {
  it("returns stable key for same input", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend", "valuation"]);
    const k2 = computeStockCacheKey("600519", ["price_trend", "valuation"]);
    expect(k1).toBe(k2);
  });

  it("differs when code changes", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend"]);
    const k2 = computeStockCacheKey("000001", ["price_trend"]);
    expect(k1).not.toBe(k2);
  });

  it("differs when angle set changes (order independent)", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend", "valuation"]);
    const k2 = computeStockCacheKey("600519", ["valuation", "price_trend"]);
    expect(k1).toBe(k2);  // 顺序无关
  });

  it("differs when angle content changes", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend"]);
    const k2 = computeStockCacheKey("600519", ["valuation"]);
    expect(k1).not.toBe(k2);
  });
});
