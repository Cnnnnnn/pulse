// @vitest-environment happy-dom
/**
 * tests/renderer/LibraryPage.test.jsx
 *
 * Task 12: LibraryPage 组合 PageHeader + ViewSwitcher + MergedFilterChip
 * + TableView (ResultsView) / CardView (AppCard 网格).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { viewMode, setViewMode, resetLibraryFilters } from "../../src/renderer/library-view-store.js";
import { results, resetCheck } from "../../src/renderer/store.js";

beforeEach(() => {
  cleanup();
  resetLibraryFilters();
  resetCheck();
});

describe("LibraryPage (Task 12)", () => {
  it("默认渲染 PageHeader + ViewSwitcher + MergedFilterChip", () => {
    render(<LibraryPage />);
    expect(screen.getByText("应用库")).toBeTruthy();
    expect(screen.getByLabelText("表格视图")).toBeTruthy();
    expect(screen.getByLabelText("卡片视图")).toBeTruthy();
    // "全部" 同时出现在 status chip 和 CategoryTabs, 用 getAllByText 允许多匹配
    expect(screen.getAllByText("全部").length).toBeGreaterThan(0);
  });
  it("card 模式渲染 app-card-grid", () => {
    setViewMode("card");
    render(<LibraryPage />);
    expect(document.querySelector(".app-card-grid")).toBeTruthy();
  });
});
