// @vitest-environment happy-dom
// tests/renderer/fund-allocation-donut.test.jsx
// T-D1: 持仓集中度风险区渲染 (computeConcentration 纯函数, 经 rowsWithMetrics 计算).
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { describeArc, buildSegments, CATEGORY_ORDER, FundAllocationDonut } from "../../src/renderer/funds/FundAllocationDonut.jsx";
import { holdings, navCache, navSource, categoryAllocation } from "../../src/renderer/funds/fundStore.js";

describe("buildSegments", () => {
  it("把市值映射成带角度的扇区, 总和360", () => {
    const seg = buildSegments({ stock: 6000, bond: 3000, money: 1000 }, 10000);
    expect(seg.length).toBe(3);
    const total = seg.reduce((s, x) => s + x.sweep, 0);
    expect(Math.round(total)).toBe(360);
  });
});

describe("describeArc", () => {
  it("生成合法 SVG path", () => {
    const d = describeArc(50, 50, 40, 0, 90);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes("A")).toBe(true);
  });
});

// 给 rowsWithMetrics / categoryAllocation 提供等市值基金 (每只 100 份, nav 1 → mv 100).
function seedEqualFunds(n = 4) {
  const cats = ["stock", "bond", "money", "qdii", "other", "stock"];
  const list = [];
  for (let i = 0; i < n; i++) {
    const code = `00000${i + 1}`;
    list.push({
      id: code,
      code,
      name: code,
      category: cats[i % cats.length],
      shares: 100,
      costNav: 1,
      addedAt: Date.now() - 86400000,
    });
  }
  holdings.value = list;
  navCache.value = {
    fetchedAt: Date.now(),
    data: Object.fromEntries(list.map((h) => [h.code, { nav: 1 }])),
    errors: {},
  };
  navSource.value = "tiantian";
}

afterEach(() => {
  cleanup();
  holdings.value = [];
  navCache.value = { fetchedAt: null, data: {}, errors: {} };
});

describe("FundAllocationDonut 风险行 (T-D1)", () => {
  it("4 只等市值: 超阈 → 渲染警示色 (top3=75%, max=25%, HHI=0.25), 整区带 warn 类", () => {
    seedEqualFunds(4);
    const { container } = render(<FundAllocationDonut />);
    const risk = container.querySelector(".fund-donut-risk");
    expect(risk).toBeTruthy();
    expect(risk.getAttribute("role")).toBe("status");
    expect(risk.getAttribute("aria-live")).toBe("polite");
    expect(risk.textContent).toContain("前三大");
    expect(risk.textContent).toContain("最大");
    expect(risk.textContent).toContain("HHI");
    expect(risk.textContent).toContain("75");
    expect(risk.textContent).toContain("25");
    expect(risk.textContent).toContain("0.25");
    expect(risk.classList.contains("fund-donut-risk-warn")).toBe(true);
  });

  it("6 只等市值: 未超阈 → 无 warn 类", () => {
    seedEqualFunds(6);
    const { container } = render(<FundAllocationDonut />);
    const risk = container.querySelector(".fund-donut-risk");
    expect(risk).toBeTruthy();
    expect(risk.classList.contains("fund-donut-risk-warn")).toBe(false);
    expect(risk.textContent).toContain("50"); // top3 约 50%
  });
});
