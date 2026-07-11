// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/preact";
import { FundHero } from "../../src/renderer/funds/FundHero.jsx";
import { holdings, navCache, navSource, searchQuery } from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  cleanup();
  // 复位, 避免污染其它测试
  holdings.value = [];
  navCache.value = { fetchedAt: null, data: {}, errors: {} };
  navSource.value = "tiantian";
  searchQuery.value = "";
});

describe("FundHero (Task 11)", () => {
  it("renders the portfolio hero with total value + charts", () => {
    // 确定性 store 状态: 让 totalMetrics 算出真实数字
    holdings.value = [
      {
        id: "h1",
        code: "000001",
        name: "测试基金",
        category: "stock",
        shares: 100,
        costNav: 1.0,
      },
    ];
    navCache.value = {
      fetchedAt: Date.now(),
      data: {
        "000001": {
          code: "000001",
          nav: 1.3,
          estimatedNav: 1.3,
          dayChange: 0.1,
          dayChangePct: 10,
        },
      },
      errors: {},
    };
    navSource.value = "tiantian";

    render(<FundHero />);

    // 总市值大数字 (¥ + 金额) — 多处含 ¥, 用 getAllByText
    expect(screen.getAllByText(/¥/).length).toBeGreaterThan(0);
    // 右侧可视化列
    expect(document.querySelector(".fund-donut")).toBeTruthy();
    expect(document.querySelector(".fund-trend")).toBeTruthy();
  });
});
