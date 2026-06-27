import { describe, it, expect } from "vitest";
import { ANGLE_DEFS, getAngle } from "../../src/stocks/stock-detail-angles";

describe("stock-detail-angles", () => {
  it("ANGLE_DEFS has exactly 7 angles", () => {
    expect(ANGLE_DEFS).toHaveLength(7);
  });

  it("each angle has required fields", () => {
    for (const a of ANGLE_DEFS) {
      expect(a.key).toMatch(/^[a-z_]+$/);
      expect(a.label).toBeTruthy();
      expect(a.group).toBeTruthy();
      expect(a.promptHint).toBeTruthy();
      expect(a.dataShape).toBeTruthy();
      expect(typeof a.fetcher).toBe("function");
    }
  });

  it("keys are unique", () => {
    const keys = ANGLE_DEFS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("groups cover 行情/财务/资金/技术/舆情", () => {
    const groups = new Set(ANGLE_DEFS.map((a) => a.group));
    expect(groups.has("行情")).toBe(true);
    expect(groups.has("财务")).toBe(true);
    expect(groups.has("资金")).toBe(true);
    expect(groups.has("技术")).toBe(true);
    expect(groups.has("舆情")).toBe(true);
  });

  it("getAngle returns matching entry", () => {
    const a = getAngle("price_trend");
    expect(a).not.toBeNull();
    expect(a.key).toBe("price_trend");
  });

  it("getAngle returns null for unknown key", () => {
    expect(getAngle("not_a_key")).toBeNull();
  });

  describe("price_trend.getSparklineData", () => {
    // import 在文件顶部
    // const { ANGLE_DEFS, getAngle } = require("../../src/stocks/stock-detail-angles.js");
    // (如果文件顶部已有 import, 复用, 不重复声明)
    const ang = getAngle("price_trend");

    it("null data 返 null", () => {
      expect(ang.sparkline(null)).toBeNull();
      expect(ang.sparkline(undefined)).toBeNull();
    });

    it("空 closes 返 null", () => {
      expect(ang.sparkline({ closes: [] })).toBeNull();
    });

    it("NaN/非数 返 null", () => {
      expect(ang.sparkline({ closes: [NaN, NaN] })).toBeNull();
    });

    it("上涨: 返 closes + color='up'", () => {
      expect(ang.sparkline({ closes: [80, 90, 100] })).toEqual({
        closes: [80, 90, 100],
        color: "up",
      });
    });

    it("下跌: 返 closes + color='down'", () => {
      expect(ang.sparkline({ closes: [100, 90, 80] })).toEqual({
        closes: [100, 90, 80],
        color: "down",
      });
    });

    it("平: 返 closes + color='flat'", () => {
      expect(ang.sparkline({ closes: [100, 100] })).toEqual({
        closes: [100, 100],
        color: "flat",
      });
    });
  });
});