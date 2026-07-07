import { describe, it, expect } from "vitest";
import { computeScores } from "../../src/stocks/diagnosis-scorer.js";

describe("diagnosis-scorer", () => {
  describe("基本面 fundamental (基于 ROE)", () => {
    it("ROE>=20 → 8 分", () => {
      const data = {
        profitability: {
          status: "ok",
          data: { roe: 24, grossMargin: 30, netMargin: 12 },
        },
      };
      const s = computeScores(data);
      expect(s.dimensions.fundamental).toBe(8);
    });
    it("ROE 15-20 → 6 分", () => {
      const data = {
        profitability: {
          status: "ok",
          data: { roe: 17, grossMargin: 25, netMargin: 10 },
        },
      };
      expect(computeScores(data).dimensions.fundamental).toBe(6);
    });
    it("ROE 缺失 (null) → null", () => {
      const data = { profitability: { status: "ok", data: { roe: null } } };
      expect(computeScores(data).dimensions.fundamental).toBeNull();
    });
    it("profitability 整个 angle 失败 → null", () => {
      const data = { profitability: { status: "failed" } };
      expect(computeScores(data).dimensions.fundamental).toBeNull();
    });
  });

  describe("估值 valuation (基于 PE 绝对值, pePercentile3y 恒 null 不可用)", () => {
    it("PE<=15 → 8", () => {
      const data = {
        valuation: {
          status: "ok",
          data: { pe: 12, pb: 1.5, pePercentile3y: null },
        },
      };
      expect(computeScores(data).dimensions.valuation).toBe(8);
    });
    it("PE 15-25 → 6", () => {
      const data = { valuation: { status: "ok", data: { pe: 20 } } };
      expect(computeScores(data).dimensions.valuation).toBe(6);
    });
    it("PE 40-60 → 3", () => {
      const data = { valuation: { status: "ok", data: { pe: 50 } } };
      expect(computeScores(data).dimensions.valuation).toBe(3);
    });
    it("PE>80 → 2", () => {
      const data = { valuation: { status: "ok", data: { pe: 100 } } };
      expect(computeScores(data).dimensions.valuation).toBe(2);
    });
    it("PE null (亏损) → null", () => {
      const data = { valuation: { status: "ok", data: { pe: null } } };
      expect(computeScores(data).dimensions.valuation).toBeNull();
    });
  });

  describe("资金 capital (基于 5 日主力净流入)", () => {
    it("正流入 → 6-8", () => {
      const data = {
        capital_flow: {
          status: "ok",
          data: { mainNetInflow5d: 5e8, mainNetInflow10d: 8e8, sampleCount: 5 },
        },
      };
      const s = computeScores(data).dimensions.capital;
      expect(s).toBeGreaterThanOrEqual(6);
      expect(s).toBeLessThanOrEqual(8);
    });
    it("流出 → 2-4", () => {
      const data = {
        capital_flow: {
          status: "ok",
          data: {
            mainNetInflow5d: -3e8,
            mainNetInflow10d: -5e8,
            sampleCount: 5,
          },
        },
      };
      const s = computeScores(data).dimensions.capital;
      expect(s).toBeGreaterThanOrEqual(2);
      expect(s).toBeLessThanOrEqual(4);
    });
    it("sampleCount=0 + 换手率高 → fallback 用 latestTurnover ≥5 → 7", () => {
      const data = {
        capital_flow: {
          status: "ok",
          data: { mainNetInflow5d: 0, mainNetInflow10d: 0, sampleCount: 0 },
        },
        volume_turnover: {
          status: "ok",
          data: { latestTurnover: 6, avgTurnover30d: 4 },
        },
      };
      expect(computeScores(data).dimensions.capital).toBe(7);
    });
    it("capital_flow 缺失 + 换手率低 → 4 (中性偏低)", () => {
      const data = {
        volume_turnover: { status: "ok", data: { latestTurnover: 0.5 } },
      };
      expect(computeScores(data).dimensions.capital).toBe(4);
    });
    it("capital_flow 缺失 + volume_turnover 也缺 → null (没替代信号)", () => {
      expect(computeScores({}).dimensions.capital).toBeNull();
    });
    it("capital_flow noData 占位 + volume_turnover 有数据 → fallback 接管", () => {
      const data = {
        capital_flow: {
          status: "ok",
          data: { mainNetInflow5d: 0, sampleCount: 0, noData: true },
        },
        volume_turnover: { status: "ok", data: { latestTurnover: 1.2 } },
      };
      // 1.2% ≥ 1 → 中性 5
      expect(computeScores(data).dimensions.capital).toBe(5);
    });
  });

  describe("技术 tech (均线排列 + MACD 柱)", () => {
    it("多头排列(价>ma5>ma20) + MACD>0 → 8", () => {
      const data = {
        tech_indicators: {
          status: "ok",
          data: {
            ma5: 11,
            ma10: 10.5,
            ma20: 10,
            macdHist: 0.3,
          },
        },
      };
      expect(computeScores(data).dimensions.tech).toBe(8);
    });
    it("MACD 死叉 (hist<0) → 3", () => {
      const data = {
        tech_indicators: {
          status: "ok",
          data: { ma5: 15, ma10: 14, ma20: 13, macdHist: -0.2 },
        },
      };
      expect(computeScores(data).dimensions.tech).toBe(3);
    });
    it("macdHist=0 且 ma20=0 (数据不足) → null", () => {
      const data = {
        tech_indicators: {
          status: "ok",
          data: { ma5: 0, ma10: 0, ma20: 0, macdHist: 0 },
        },
      };
      expect(computeScores(data).dimensions.tech).toBeNull();
    });
  });

  describe("风险 risk (反向分: 越高=越安全)", () => {
    it("低 PE → 高分(安全)", () => {
      const data = { valuation: { status: "ok", data: { pe: 12 } } };
      expect(computeScores(data).dimensions.risk).toBeGreaterThanOrEqual(7);
    });
    it("极高 PE → 低分(危险)", () => {
      const data = { valuation: { status: "ok", data: { pe: 120 } } };
      expect(computeScores(data).dimensions.risk).toBeLessThanOrEqual(4);
    });
    it("估值+舆情都缺 → null", () => {
      expect(computeScores({}).dimensions.risk).toBeNull();
    });
    it("负面舆情占多数 → 在 PE 基础分上降 1 分", () => {
      const data = {
        valuation: { status: "ok", data: { pe: 12 } },
        news_buzz: {
          status: "ok",
          data: {
            items: [
              { title: "a", sentiment: "negative" },
              { title: "b", sentiment: "negative" },
              { title: "c", sentiment: "neutral" },
            ],
          },
        },
      };
      expect(computeScores(data).dimensions.risk).toBe(7);
    });
    it("正面舆情占多数 → 在 PE 基础分上升 1 分", () => {
      const data = {
        valuation: { status: "ok", data: { pe: 12 } },
        news_buzz: {
          status: "ok",
          data: {
            items: [
              { title: "a", sentiment: "positive" },
              { title: "b", sentiment: "positive" },
              { title: "c", sentiment: "neutral" },
            ],
          },
        },
      };
      expect(computeScores(data).dimensions.risk).toBe(8);
    });
  });

  describe("overall 加权", () => {
    it("全部维度齐全 → 加权平均", () => {
      const data = {
        profitability: { status: "ok", data: { roe: 24 } },
        valuation: { status: "ok", data: { pe: 12 } },
        capital_flow: {
          status: "ok",
          data: { mainNetInflow5d: 5e8, sampleCount: 5 },
        },
        tech_indicators: {
          status: "ok",
          data: { ma5: 11, ma20: 10, macdHist: 0.3 },
        },
      };
      const s = computeScores(data);
      // fundamental=8(0.25) valuation=8(0.20) capital=7(0.15) tech=8(0.15) risk=8(0.25)
      // = 7.85 → 保留1位小数 → 7.9
      expect(s.overall).toBe(7.9);
    });
    it("全部缺失 → overall null", () => {
      expect(computeScores({}).overall).toBeNull();
    });
    it("部分缺失 → 仅用现存维度重分配权重", () => {
      const data = { profitability: { status: "ok", data: { roe: 24 } } };
      const s = computeScores(data);
      expect(s.overall).toBe(8);
    });
    it("rationale 含具体依据", () => {
      const data = {
        valuation: { status: "ok", data: { pe: 20 } },
        profitability: { status: "ok", data: { roe: 18 } },
      };
      const r = computeScores(data).rationale;
      expect(r.some((x) => x.includes("PE"))).toBe(true);
      expect(r.some((x) => x.includes("ROE"))).toBe(true);
    });
  });
});
