import { describe, it, expect } from "vitest";
import {
  MARKET_PARAM,
  FIELD_MAP,
  FIELDS_PARAM,
  MARKET_CAP_TIERS,
  tierForMarketCap,
  DEFAULT_SCREENER_CRITERIA,
} from "../../src/stocks/stock-constants";

describe("stock-constants", () => {
  it("MARKET_PARAM covers sh + sz main board", () => {
    expect(MARKET_PARAM).toBe(
      "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
    );
  });

  it("FIELD_MAP maps east-money fields to stock keys", () => {
    expect(FIELD_MAP.code).toBe("f12");
    expect(FIELD_MAP.name).toBe("f14");
    expect(FIELD_MAP.price).toBe("f2");
    expect(FIELD_MAP.changePct).toBe("f3");
    expect(FIELD_MAP.turnover).toBe("f8");
    expect(FIELD_MAP.pe).toBe("f9");
    expect(FIELD_MAP.pb).toBe("f23");
    expect(FIELD_MAP.roe).toBe("f21");
    expect(FIELD_MAP.industry).toBe("f100");
    expect(FIELD_MAP.marketCap).toBe("f20");
  });

  it("FIELDS_PARAM is comma-joined field values", () => {
    expect(typeof FIELDS_PARAM).toBe("string");
    expect(FIELDS_PARAM).toContain("f12");
    expect(FIELDS_PARAM).toContain("f20");
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
  });
});
