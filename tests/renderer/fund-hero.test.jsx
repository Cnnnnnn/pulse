// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  fundsNavFetch: vi.fn(async () => ({ ok: true })),
  fundsNavState: vi.fn(async () => ({ ok: true })),
  fundsList: vi.fn(async () => ({ ok: true, holdings: [] })),
}));
vi.mock("../../src/renderer/api.js", () => ({ api: mockApi }));

import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/preact";
import { FundHero } from "../../src/renderer/funds/FundHero.jsx";
import {
  holdings,
  navCache,
  navSource,
  searchQuery,
  fundsRefreshing,
  fundsRefreshError,
} from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  cleanup();
  // 复位, 避免污染其它测试
  holdings.value = [];
  navCache.value = { fetchedAt: null, data: {}, errors: {} };
  navSource.value = "tiantian";
  searchQuery.value = "";
  fundsRefreshing.value = false;
  fundsRefreshError.value = null;
});

describe("FundHero (Task 11 + A)", () => {
  it("renders the portfolio hero with total value + charts", () => {
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

    expect(screen.getAllByText(/¥/).length).toBeGreaterThan(0);
    expect(document.querySelector(".fund-donut")).toBeTruthy();
    expect(document.querySelector(".fund-trend")).toBeTruthy();
  });

  it("刷新状态行默认显示『尚未同步』", () => {
    render(<FundHero />);
    const status = document.querySelector(".fund-hero-status");
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("尚未同步");
  });

  it("navCache 带 fetchedAt 时显示『最后同步』", () => {
    navCache.value = { fetchedAt: Date.now() - 60 * 1000, data: {}, errors: {} };
    render(<FundHero />);
    expect(document.querySelector(".fund-hero-status").textContent).toContain("最后同步");
  });

  it("fundsRefreshing=true 时显示『刷新中…』", () => {
    fundsRefreshing.value = true;
    render(<FundHero />);
    expect(document.querySelector(".fund-hero-status").textContent).toContain("刷新中…");
  });

  it("fundsRefreshError 时显示重试按钮, 点击触发 fetchNavNow", async () => {
    fundsRefreshError.value = "x";
    mockApi.fundsNavFetch.mockClear();
    render(<FundHero />);
    const status = document.querySelector(".fund-hero-status");
    expect(status.textContent).toContain("刷新失败");
    const retry = status.querySelector(".fund-status-retry");
    expect(retry).toBeTruthy();
    expect(retry.getAttribute("aria-label")).toBe("重试刷新");
    await fireEvent.click(retry);
    await waitFor(() => expect(mockApi.fundsNavFetch).toHaveBeenCalled());
    // 成功后错误被清空
    await waitFor(() => expect(fundsRefreshError.value).toBeNull());
  });
});
