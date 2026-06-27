// @vitest-environment happy-dom
/**
 * tests/renderer/overview-page.test.jsx
 *
 * v2.50 (T5): OverviewPage 集成测试.
 *   - EmptyState 分支: 0 监控 app → 显示 CTA 按钮
 *   - 3-列 分支: 加载完 KPI → 显示 overview-grid, 3 个子组件
 *   - 首次检查 CTA → 调 api.versionsRunCheck + loading 态
 *
 * 4 个 Overview* 组件 (T1-T4) 单独测过, 这里只测组合 + EmptyState 切换.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/preact";
import { OverviewPage, _resetOverviewSignals } from "../../src/renderer/components/OverviewPage.jsx";

const mockApi = {
  versionsOverviewKpis: vi.fn(),
  versionsOverviewWatchlist: vi.fn(),
  versionsOverviewRecent: vi.fn(),
  versionsRunCheck: vi.fn(),
};

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsOverviewKpis() { return mockApi.versionsOverviewKpis; },
    get versionsOverviewWatchlist() { return mockApi.versionsOverviewWatchlist; },
    get versionsOverviewRecent() { return mockApi.versionsOverviewRecent; },
    get versionsRunCheck() { return mockApi.versionsRunCheck; },
  },
}));

vi.mock("../../src/renderer/route-store.js", () => ({
  navigateTo: vi.fn(),
}));

import { navigateTo } from "../../src/renderer/route-store.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.versionsOverviewKpis.mockReset();
  mockApi.versionsOverviewWatchlist.mockReset();
  mockApi.versionsOverviewRecent.mockReset();
  mockApi.versionsRunCheck.mockReset();
  mockApi.versionsRunCheck.mockResolvedValue({ started: true });
  // 重置 module-level signals (3 个 IPC signal 是文件顶层定义, 多 test 共享)
  _resetOverviewSignals();
});

describe("OverviewPage integration", () => {
  it("shows EmptyState when kpis.total === 0", async () => {
    mockApi.versionsOverviewKpis.mockResolvedValue({ upgradable: 0, latest: 0, error: 0, total: 0 });
    mockApi.versionsOverviewWatchlist.mockResolvedValue([]);
    mockApi.versionsOverviewRecent.mockResolvedValue([]);

    const { container } = render(<OverviewPage />);
    // EmptyState has the CTA button
    const cta = container.querySelector(".cta-button");
    expect(cta).toBeTruthy();
    // 3-col grid should NOT exist yet
    expect(container.querySelector(".overview-grid")).toBeNull();
  });

  it("shows 3-column grid when kpis.total > 0", async () => {
    mockApi.versionsOverviewKpis.mockResolvedValue({ upgradable: 2, latest: 5, error: 1, total: 8 });
    mockApi.versionsOverviewWatchlist.mockResolvedValue([
      { name: "vscode", has_update: true },
      { name: "slack", has_update: false },
    ]);
    mockApi.versionsOverviewRecent.mockResolvedValue([
      { kind: "app-upgrade", appName: "vscode", ts: Date.now() - 60000 },
    ]);

    const { container } = render(<OverviewPage />);
    await waitFor(() => {
      const grid = container.querySelector(".overview-grid");
      expect(grid).toBeTruthy();
    });
    const grid = container.querySelector(".overview-grid");
    expect(grid.children).toHaveLength(3);
    // EmptyState 不应该出现
    expect(container.querySelector(".cta-button")).toBeNull();
  });

  it("EmptyState CTA click calls api.versionsRunCheck and shows loading", async () => {
    mockApi.versionsOverviewKpis.mockResolvedValue({ upgradable: 0, latest: 0, error: 0, total: 0 });
    mockApi.versionsOverviewWatchlist.mockResolvedValue([]);
    mockApi.versionsOverviewRecent.mockResolvedValue([]);
    // 返 pending, 让 loading 态能 hold 住
    let resolveRunCheck;
    mockApi.versionsRunCheck.mockReturnValue(new Promise((r) => { resolveRunCheck = r; }));

    const { container } = render(<OverviewPage />);
    const cta = container.querySelector(".cta-button");
    fireEvent.click(cta);

    await waitFor(() => {
      expect(cta.getAttribute("aria-busy")).toBe("true");
    });
    expect(cta.disabled).toBe(true);
    expect(mockApi.versionsRunCheck).toHaveBeenCalledTimes(1);

    // resolve 让 isLoadingCheck 走 finally
    await act(async () => {
      resolveRunCheck({ started: true });
    });
  });

  it("View all button in watchlist calls navigateTo('library')", async () => {
    mockApi.versionsOverviewKpis.mockResolvedValue({ upgradable: 1, latest: 0, error: 0, total: 1 });
    mockApi.versionsOverviewWatchlist.mockResolvedValue([{ name: "vscode", has_update: true }]);
    mockApi.versionsOverviewRecent.mockResolvedValue([]);

    const { container } = render(<OverviewPage />);
    await waitFor(() => {
      expect(container.querySelector(".overview-grid")).toBeTruthy();
    });
    const link = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("View all"),
    );
    link.click();
    expect(navigateTo).toHaveBeenCalledWith("library");
  });

  it("T3 shape mapping: app-upgrade kind from IPC maps to type=upgrade + description", async () => {
    mockApi.versionsOverviewKpis.mockResolvedValue({ upgradable: 1, latest: 0, error: 0, total: 1 });
    mockApi.versionsOverviewWatchlist.mockResolvedValue([]);
    // IPC real shape (kind/appName/ts) — 必须 map 到 T3 contract (type/description/timestamp)
    mockApi.versionsOverviewRecent.mockResolvedValue([
      { kind: "app-upgrade", appName: "vscode", ts: Date.now() - 60000 },
    ]);

    const { container } = render(<OverviewPage />);
    await waitFor(() => {
      expect(container.querySelector(".overview-grid")).toBeTruthy();
    });
    // T3 renders description + 升 (upgrade) label
    expect(container.textContent).toContain("vscode");
    expect(container.textContent).toContain("升");
  });

  it("renders watchlist dots/badges from real IPC shape (name + has_update → id + name + status)", async () => {
    mockApi.versionsOverviewKpis.mockResolvedValue({ upgradable: 1, latest: 1, error: 0, total: 2 });
    // IPC real shape: 只 name + has_update, 没有 id 也没有 status.
    mockApi.versionsOverviewWatchlist.mockResolvedValue([
      { name: "vscode", has_update: true },
      { name: "slack", has_update: false },
    ]);
    mockApi.versionsOverviewRecent.mockResolvedValue([]);

    const { container } = render(<OverviewPage />);
    await waitFor(() => {
      expect(container.querySelector(".overview-grid")).toBeTruthy();
    });

    const items = container.querySelectorAll(".watchlist-item");
    expect(items).toHaveLength(2);
    // 形状映射后 vscode 拿 upgradable status → 显 dot-upgradable + 升 badge
    const upgradableDot = container.querySelector(".dot-upgradable");
    expect(upgradableDot).toBeTruthy();
    const badges = container.querySelectorAll(".watchlist-badge");
    expect(badges).toHaveLength(1);
    // 没 status 兜底成 undefined 时不会出现 dot-undefined 这种 broken class
    expect(container.querySelector(".dot-undefined")).toBeNull();
    // name 字段被透传
    expect(items[0].textContent).toContain("vscode");
    expect(items[1].textContent).toContain("slack");
    // 没 React key warning (key 来自 item.id = name, 都非空)
    for (const li of items) {
      expect(li.getAttribute("role")).toBe("listitem");
    }
  });
});
