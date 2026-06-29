import { describe, it, expect } from "vitest";
import { ANGLE_DEFS, getAngle } from "../../src/stocks/stock-detail-angles";

describe("stock-detail-angles", () => {
  it("ANGLE_DEFS has exactly 9 angles (7 老 + peer_compare + moat_score)", () => {
    expect(ANGLE_DEFS).toHaveLength(9);
  });

  it("each angle has required fields", () => {
    for (const a of ANGLE_DEFS) {
      expect(a.key).toMatch(/^[a-z_]+$/);
      expect(a.label).toBeTruthy();
      expect(a.group).toBeTruthy();
      expect(a.promptHint).toBeTruthy();
      expect(a.dataShape).toBeTruthy();
      expect(typeof a.fetcher).toBe("function");
      expect(typeof a.summarizeForAi).toBe("function");
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

  it("包含 9 个 angle (7 老 + peer_compare + moat_score)", () => {
    const keys = ANGLE_DEFS.map((a) => a.key);
    expect(keys).toContain("price_trend");
    expect(keys).toContain("volume_turnover");
    expect(keys).toContain("valuation");
    expect(keys).toContain("profitability");
    expect(keys).toContain("capital_flow");
    expect(keys).toContain("tech_indicators");
    expect(keys).toContain("news_buzz");
    expect(keys).toContain("peer_compare");
    expect(keys).toContain("moat_score");
  });

  it("peer_compare / moat_score group 都是 '财务'", () => {
    expect(getAngle("peer_compare").group).toBe("财务");
    expect(getAngle("moat_score").group).toBe("财务");
  });

  it("peer_compare / moat_score summarizeForAi 可调用, 不抛", () => {
    const pc = getAngle("peer_compare");
    const ms = getAngle("moat_score");
    // 空数据: summarizePeerCompare 返 "暂无同业数据" 或 null
    expect(() => pc.summarizeForAi(null)).not.toThrow();
    // 完整数据: 返带 PE / PB 排名的字符串
    const pcOut = pc.summarizeForAi({
      pe: 30, peIndustryMedian: 25, peRank: 5, peTotal: 50, peDeviationPct: 20,
      pb: 4, pbIndustryMedian: 3, pbRank: 10, pbTotal: 50, pbDeviationPct: 33.3,
    });
    expect(pcOut).toMatch(/PE 30\.0 倍/);
    expect(pcOut).toMatch(/排名 5\/50/);
    // moat_score: 完整 3 维都给的 case
    const msOut = ms.summarizeForAi({
      score: 7,
      breakdown: { marginEdge: 3, roicEdge: 2, revenueStability: 2 },
    });
    expect(msOut).toMatch(/护城河 7\/9/);
    expect(msOut).toMatch(/毛利 3\/3/);
    expect(msOut).toMatch(/ROIC 2\/3/);
    expect(msOut).toMatch(/营收 2\/3/);
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

    it("上涨: 返 closes 数组", () => {
      expect(ang.sparkline({ closes: [80, 90, 100] })).toEqual([80, 90, 100]);
    });

    it("下跌: 返 closes 数组", () => {
      expect(ang.sparkline({ closes: [100, 90, 80] })).toEqual([100, 90, 80]);
    });

    it("平: 返 closes 数组", () => {
      expect(ang.sparkline({ closes: [100, 100] })).toEqual([100, 100]);
    });
  });
});