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
import { viewMode, setViewMode, resetLibraryFilters } from "../../src/renderer/library-view-store.js";
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
