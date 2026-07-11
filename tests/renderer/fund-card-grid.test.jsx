// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { FundCardGrid } from "../../src/renderer/funds/FundCardGrid.jsx";
import { holdings, navCache } from "../../src/renderer/funds/fundStore.js";

afterEach(cleanup);

describe("FundCardGrid (Task 10)", () => {
  it("每个持仓渲染一张卡片", () => {
    holdings.value = [
      { id: "1", code: "000001", name: "基金A", category: "stock", shares: 100, costNav: 1.0 },
      { id: "2", code: "000002", name: "基金B", category: "bond", shares: 200, costNav: 1.0 },
    ];
    navCache.value = {
      fetchedAt: null,
      data: { "000001": { nav: 1.3 }, "000002": { nav: 1.1 } },
      errors: {},
    };
    const { container } = render(<FundCardGrid />);
    expect(container.querySelectorAll(".fund-card").length).toBe(2);
  });

  it("空持仓显示空状态", () => {
    holdings.value = [];
    navCache.value = { fetchedAt: null, data: {}, errors: {} };
    const { container } = render(<FundCardGrid />);
    expect(container.querySelector(".fund-empty-state")).toBeTruthy();
  });
});
