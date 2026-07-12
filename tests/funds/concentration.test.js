// tests/funds/concentration.test.js
// 阶段 D (蓝图 §3.4): computeConcentration 纯函数单测.
import { describe, it, expect } from "vitest";
import { computeConcentration } from "../../src/funds/concentration.js";

// 构造 rowsWithMetrics: 每项 { holding:{code,name}, metrics:{marketValue} }
function row(code, marketValue) {
  return { holding: { code, name: code }, metrics: { marketValue } };
}

describe("computeConcentration (阶段 D)", () => {
  it("4 只等市值: top3Pct=75 / maxWeight=25 / hhi=0.25 / warn=true", () => {
    const rows = [100, 100, 100, 100].map((v, i) => row(`F${i}`, v));
    const c = computeConcentration(rows);
    expect(c.total).toBe(400);
    expect(c.top3Pct).toBeCloseTo(75, 4);
    expect(c.maxWeight).toBeCloseTo(25, 4);
    expect(c.hhi).toBeCloseTo(0.25, 4);
    expect(c.warn).toBe(true); // 75 > 60
  });

  it("权重数组按 code/name 顺序与占比", () => {
    const rows = [100, 100, 100, 100].map((v, i) => row(`F${i}`, v));
    const c = computeConcentration(rows);
    expect(c.weights).toHaveLength(4);
    expect(c.weights[0]).toMatchObject({ code: "F0", weight: 0.25 });
  });

  it("total=0 (无市值) → 全 0 / warn=false, 不抛错", () => {
    const rows = [0, 0, 0].map((v, i) => row(`F${i}`, v));
    const c = computeConcentration(rows);
    expect(c.total).toBe(0);
    expect(c.top3Pct).toBe(0);
    expect(c.maxWeight).toBe(0);
    expect(c.hhi).toBe(0);
    expect(c.warn).toBe(false);
  });

  it("输入非数组/空 → 安全返回零值", () => {
    expect(computeConcentration(null).warn).toBe(false);
    expect(computeConcentration([]).total).toBe(0);
    expect(computeConcentration(undefined).warn).toBe(false);
  });

  it("阈值: 前三大 > 60% 触发 warn", () => {
    // 5 只市值悬殊: 前 3 只占绝对多数
    const rows = [900, 50, 50, 1, 1].map((v, i) => row(`F${i}`, v));
    const c = computeConcentration(rows);
    expect(c.top3Pct).toBeGreaterThan(60);
    expect(c.warn).toBe(true);
  });

  it("阈值: HHI > 0.18 触发 warn (高度集中)", () => {
    // 单只占绝大部分 → HHI 很高
    const rows = [1000, 10, 10].map((v, i) => row(`F${i}`, v));
    const c = computeConcentration(rows);
    expect(c.hhi).toBeGreaterThan(0.18);
    expect(c.warn).toBe(true);
  });

  it("充分散 (10 只等市值): top3Pct=30 / hhi=0.1 / warn=false", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`F${i}`, 100));
    const c = computeConcentration(rows);
    expect(c.top3Pct).toBeCloseTo(30, 4);
    expect(c.hhi).toBeCloseTo(0.1, 4);
    expect(c.warn).toBe(false);
  });
});
