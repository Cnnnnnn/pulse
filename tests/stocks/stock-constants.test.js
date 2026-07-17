import { describe, it, expect } from "vitest";
import {
  MARKET_PARAM,
  FIELD_MAP,
  FIELDS_PARAM,
  SORT_KEY_TO_FID,
  DEFAULT_FID,
  MARKET_CAP_TIERS,
  tierForMarketCap,
  DEFAULT_SCREENER_CRITERIA,
} from "../../src/stocks/stock-constants";

describe("stock-constants", () => {
  it("MARKET_PARAM covers sh + sz main board", () => {
    expect(MARKET_PARAM).toBe("m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23");
  });

  it("FIELD_MAP maps east-money fields to stock keys", () => {
    expect(FIELD_MAP.code).toBe("f12");
    expect(FIELD_MAP.name).toBe("f14");
    expect(FIELD_MAP.price).toBe("f2");
    expect(FIELD_MAP.changePct).toBe("f3");
    expect(FIELD_MAP.turnover).toBe("f8");
    expect(FIELD_MAP.pe).toBe("f9");
    expect(FIELD_MAP.pb).toBe("f23");
    expect(FIELD_MAP.roe).toBe("f173");
    expect(FIELD_MAP.industry).toBe("f100");
    expect(FIELD_MAP.marketCap).toBe("f20");
    // ponytail 2026-07-18 P0-0: 修正 f57/f58 → f41/f46. 之前 f57 实际是资产负债比率, f58 是股东权益.
    // 正确: f41=营业收入同比(%), f46=净利润同比(%). web search 验证 3 个独立来源.
    expect(FIELD_MAP.revenueGrowthYoY).toBe("f41");
    expect(FIELD_MAP.netIncomeGrowthYoY).toBe("f46");
  });

  it("FIELDS_PARAM is comma-joined field values", () => {
    expect(typeof FIELDS_PARAM).toBe("string");
    expect(FIELDS_PARAM).toContain("f12");
    expect(FIELDS_PARAM).toContain("f20");
  });

  it("SORT_KEY_TO_FID maps sort keys to east-money fid (roe→f173)", () => {
    expect(SORT_KEY_TO_FID.roe).toBe("f173");
    expect(SORT_KEY_TO_FID.pe).toBe("f9");
    expect(SORT_KEY_TO_FID.pb).toBe("f23");
    expect(SORT_KEY_TO_FID.changePct).toBe("f3");
    expect(SORT_KEY_TO_FID.marketCap).toBe("f20");
    // ponytail 2026-07-18 P0-0: 同步 f57/f58 → f41/f46.
    expect(SORT_KEY_TO_FID.revenueGrowthYoY).toBe("f41");
    expect(SORT_KEY_TO_FID.netIncomeGrowthYoY).toBe("f46");
  });

  it("DEFAULT_FID is f173 (ROE)", () => {
    expect(DEFAULT_FID).toBe("f173");
  });

  it("tierForMarketCap classifies by thresholds (500亿=5e11, 100亿=1e11)", () => {
    expect(tierForMarketCap(5e11 + 1)).toBe("large");
    expect(tierForMarketCap(5e11)).toBe("large");
    expect(tierForMarketCap(1e11 + 1)).toBe("mid");
    expect(tierForMarketCap(1e11)).toBe("mid");
    expect(tierForMarketCap(1e11 - 1)).toBe("small");
    expect(tierForMarketCap(null)).toBe(null);
    expect(tierForMarketCap(undefined)).toBe(null);
    expect(tierForMarketCap(NaN)).toBe(null);
  });

  it("MARKET_CAP_TIERS lists all|large|mid|small", () => {
    expect(MARKET_CAP_TIERS).toEqual(["all", "large", "mid", "small"]);
  });

  it("DEFAULT_SCREENER_CRITERIA has null for unset filters", () => {
    expect(DEFAULT_SCREENER_CRITERIA.marketCapTier).toBe("all");
    expect(DEFAULT_SCREENER_CRITERIA.industries).toEqual([]);
    expect(DEFAULT_SCREENER_CRITERIA.peMin).toBe(null);
    // ponytail 2026-07-08 D-1: 营收/净利同比下限默认不限.
    expect(DEFAULT_SCREENER_CRITERIA.revenueGrowthYoYMin).toBe(null);
    expect(DEFAULT_SCREENER_CRITERIA.netIncomeGrowthYoYMin).toBe(null);
  });
});
