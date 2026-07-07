import { describe, it, expect } from "vitest";
import { ANGLE_DEFS, getAngle } from "../../src/stocks/stock-detail-angles";

describe("stock-detail-angles", () => {
  it("ANGLE_DEFS has 12 angles (9 基础 + 3 P1 季频/静态; 删 industry_momentum + margin_trading 周末永远空)", () => {
    // ponytail: 2026-07-07 — 锁死 12 提醒"加新 angle 必须改这 5 处: ANGLE_DEFS /
    // ALL_ANGLES / ANGLE_LABELS / ModuleGrid / tests". 删 industry_momentum + margin_trading
    // 后保持 5 处同步, 见 diagnosisStore.js 注释.
    expect(ANGLE_DEFS).toHaveLength(12);
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

  it("groups cover 行情/财务/资金/技术/舆情/股东/股本/预期", () => {
    // ponytail: 2026-07-07 加预期/股东/股本 3 个新 group.
    const groups = new Set(ANGLE_DEFS.map((a) => a.group));
    expect(groups.has("行情")).toBe(true);
    expect(groups.has("财务")).toBe(true);
    expect(groups.has("资金")).toBe(true);
    expect(groups.has("技术")).toBe(true);
    expect(groups.has("舆情")).toBe(true);
    expect(groups.has("股东")).toBe(true);
    expect(groups.has("股本")).toBe(true);
    expect(groups.has("预期")).toBe(true);
  });

  it("getAngle returns matching entry", () => {
    const a = getAngle("price_trend");
    expect(a).not.toBeNull();
    expect(a.key).toBe("price_trend");
  });

  it("getAngle returns null for unknown key", () => {
    expect(getAngle("not_a_key")).toBeNull();
  });

  it("包含 12 个 angle (9 基础 + 3 季频/静态: earnings_forecast, shareholders, corporate_events)", () => {
    const keys = ANGLE_DEFS.map((a) => a.key);
    for (const k of [
      "price_trend",
      "volume_turnover",
      "valuation",
      "profitability",
      "capital_flow",
      "tech_indicators",
      "news_buzz",
      "peer_compare",
      "moat_score",
      "earnings_forecast",
      "shareholders",
      "corporate_events",
    ]) {
      expect(keys).toContain(k);
    }
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
    // 完整数据: 返带 PE/PB 历史分位的字符串 (新结构, 旧的行业中位/排名字段已废弃)
    const pcOut = pc.summarizeForAi({
      industry: "白酒",
      pe: 30,
      pePercentile: 75,
      peValuationStatus: "偏高",
      pb: 4,
      pbPercentile: 60,
      pbValuationStatus: "合理",
      roeIndustryMedian: 22.5,
      grossMarginIndustryMedian: 70.0,
    });
    expect(pcOut).toMatch(/行业: 白酒/);
    expect(pcOut).toMatch(/PE 30\.0 倍/);
    expect(pcOut).toMatch(/历史 75% 分位/);
    expect(pcOut).toMatch(/行业 ROE 中位 22\.5%/);
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
