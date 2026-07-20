// @vitest-environment happy-dom
/**
 * tests/renderer/LibraryPage.test.jsx
 *
 * LibraryPage 组合 PageHeader + ViewSwitcher + MergedFilterChip
 * + TableView (ResultsView) / CardView (AppCard 网格).
 * 2026-06-27: 新增空态分支 + PageHeader 检查更新主按钮.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { viewMode, setViewMode, resetLibraryFilters } from "../../src/renderer/store/library-view-store.js";
import { results, resetCheck } from "../../src/renderer/store.js";

const mockRunCheck = vi.fn();
vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsRunCheck() { return mockRunCheck; },
    get brewUpgrade() { return () => Promise.resolve(); },
    get detectResultsExport() { return () => Promise.resolve(); },
  },
}));

beforeEach(() => {
  cleanup();
  resetLibraryFilters();
  resetCheck();
  vi.clearAllMocks();
  mockRunCheck.mockReset();
});

describe("LibraryPage (Task 12)", () => {
  it("默认渲染 PageHeader + ViewSwitcher + MergedFilterChip", () => {
    // 填充一个结果, 避开空态
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    expect(screen.getByText("应用库")).toBeTruthy();
    expect(screen.getByLabelText("表格视图")).toBeTruthy();
    expect(screen.getByLabelText("卡片视图")).toBeTruthy();
    expect(screen.getAllByText("全部").length).toBeGreaterThan(0);
  });

  it("card 模式渲染 app-card-grid", () => {
    setViewMode("card");
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    expect(document.querySelector(".app-card-grid")).toBeTruthy();
  });
});

describe("LibraryPage 滚动结构 (2026-07-03 修搜索栏滚动穿透)", () => {
  // 旧实现: PageHeader + 搜索栏用 position:sticky + top:var(--page-header-h)
  // 钉顶, 但 --page-header-h 全项目从未定义 → 退回 auto → sticky 失效, 搜索栏
  // 与标题同钉 top:0 互相覆盖, 滚动时搜索栏"穿透"浮在最上层.
  // 现改为 flex 布局: 列表区单独包进 .library-list-scroll 滚动容器,
  // header/搜索栏作为非滚动 flex 项自然钉顶.
  it("列表区被 .library-list-scroll 包裹 (滚动只发生在列表区)", () => {
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    const { container } = render(<LibraryPage />);
    const scroll = container.querySelector(".library-list-scroll");
    expect(scroll).toBeTruthy();
    // 搜索栏不应落在滚动容器内 (否则它跟列表一起滚走)
    const filter = container.querySelector(".merged-filter");
    expect(filter).toBeTruthy();
    expect(scroll.contains(filter)).toBe(false);
    // .results-container (table 模式列表) 必须在滚动容器内
    expect(scroll.querySelector(".results-container")).toBeTruthy();
  });

  it("card 模式列表区同样在滚动容器内", () => {
    setViewMode("card");
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    const { container } = render(<LibraryPage />);
    const scroll = container.querySelector(".library-list-scroll");
    expect(scroll.querySelector(".app-card-grid")).toBeTruthy();
  });
});

describe("LibraryPage 空态 + 检查更新按钮", () => {
  it("results.size === 0 时显示 OverviewEmptyState CTA, 不显示列表", () => {
    results.value = new Map(); // 空
    const { container } = render(<LibraryPage />);
    expect(container.querySelector(".overview-empty-state")).toBeTruthy();
    expect(container.querySelector(".cta-button")).toBeTruthy();
    expect(container.querySelector(".merged-filter")).toBeFalsy();
  });

  it("空态 CTA 点击触发 api.versionsRunCheck", async () => {
    let resolve;
    mockRunCheck.mockReturnValue(new Promise((r) => { resolve = r; }));
    results.value = new Map();
    const { container } = render(<LibraryPage />);
    const cta = container.querySelector(".cta-button");
    fireEvent.click(cta);
    await waitFor(() => expect(mockRunCheck).toHaveBeenCalledTimes(1));
    await Promise.resolve().then(() => resolve({ started: true }));
  });

  it("有数据时 PageHeader 显示醒目的检查更新主按钮", () => {
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    const btn = screen.getByTestId("library-run-check");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/检查更新/);
  });

  it("检查更新主按钮点击触发 api.versionsRunCheck", async () => {
    mockRunCheck.mockResolvedValue({ started: true });
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    fireEvent.click(screen.getByTestId("library-run-check"));
    await waitFor(() => expect(mockRunCheck).toHaveBeenCalledTimes(1));
  });
});
