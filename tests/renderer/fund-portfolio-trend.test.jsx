import { describe, it, expect } from "vitest";
import { buildLinePath, buildAreaPath, recentTotals } from "../../src/renderer/funds/FundPortfolioTrend.jsx";

const SNAP = [
  { date: "2026-07-09", totalMarketValue: 100 },
  { date: "2026-07-10", totalMarketValue: 110 },
  { date: "2026-07-11", totalMarketValue: 105 },
];

describe("recentTotals", () => {
  it("取最近N天并升序", () => {
    expect(recentTotals(SNAP, 30).length).toBe(3);
  });
});
describe("buildLinePath", () => {
  it("生成M/L折线", () => {
    const d = buildLinePath([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(d.startsWith("M")).toBe(true);
  });
});
describe("buildAreaPath", () => {
  it("闭合到基线", () => {
    const d = buildAreaPath([{ x: 0, y: 0 }, { x: 10, y: 10 }], 90);
    expect(d.endsWith("Z")).toBe(true);
  });
});
