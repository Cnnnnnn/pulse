// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  fundsList: vi.fn(async () => ({ ok: true, holdings: [] })),
}));
vi.mock("../../src/renderer/api.js", () => ({ api: mockApi }));

import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/preact";
import { FundCardGrid } from "../../src/renderer/funds/FundCardGrid.jsx";
import {
  holdings,
  navCache,
  searchQuery,
  activeCategory,
  fundsLoading,
  fundsLoadError,
  addModalOpen,
} from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  cleanup();
  holdings.value = [];
  navCache.value = { fetchedAt: null, data: {}, errors: {} };
  searchQuery.value = "";
  activeCategory.value = "all";
  fundsLoading.value = false;
  fundsLoadError.value = null;
  addModalOpen.value = false;
  mockApi.fundsList.mockClear();
});

describe("FundCardGrid (Task 10 + B)", () => {
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

  it("fundsLoading=true 渲染加载态", () => {
    fundsLoading.value = true;
    const { container } = render(<FundCardGrid />);
    const el = container.querySelector(".fund-empty-state--loading");
    expect(el).toBeTruthy();
    expect(el.textContent).toContain("加载中");
  });

  it("fundsLoadError 渲染错误 + 重试按钮, 点击调用 loadFunds", async () => {
    fundsLoadError.value = "err";
    render(<FundCardGrid />);
    const el = document.querySelector(".fund-empty-state--error");
    expect(el.textContent).toContain("加载失败：err");
    const retry = el.querySelector("button.fund-btn");
    expect(retry).toBeTruthy();
    mockApi.fundsList.mockClear();
    await fireEvent.click(retry);
    await waitFor(() => expect(mockApi.fundsList).toHaveBeenCalled());
  });

  it("有持仓但被搜索过滤 → 没有匹配的持仓", () => {
    holdings.value = [
      { id: "1", code: "000001", name: "基金A", category: "stock", shares: 100, costNav: 1.0 },
    ];
    navCache.value = { fetchedAt: null, data: { "000001": { nav: 1.3 } }, errors: {} };
    searchQuery.value = "zzzzz";
    const { container } = render(<FundCardGrid />);
    expect(container.querySelector(".fund-empty-state").textContent).toContain("没有匹配的持仓");
  });

  it("全空且无过滤 → 添加第一只基金, 点击调用 openAddModal", async () => {
    holdings.value = [];
    const { container } = render(<FundCardGrid />);
    const cta = container.querySelector(".fund-empty-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toContain("添加第一只基金");
    await fireEvent.click(cta);
    expect(addModalOpen.value).toBe(true);
  });
});
