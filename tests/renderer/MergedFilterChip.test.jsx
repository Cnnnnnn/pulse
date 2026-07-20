// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { MergedFilterChip } from "../../src/renderer/components/MergedFilterChip.jsx";
import {
  filterStatus, filterCategory, searchQuery,
  setFilterStatus, setFilterCategory, setSearchQuery, resetLibraryFilters,
} from "../../src/renderer/store/library-view-store.js";

beforeEach(() => {
  cleanup();
  resetLibraryFilters();
});

describe("MergedFilterChip", () => {
  it("renders search + 4 status chips + reset", () => {
    render(<MergedFilterChip />);
    expect(screen.getByPlaceholderText("搜索 app 名称...")).toBeTruthy();
    expect(screen.getByText("全部")).toBeTruthy();
    expect(screen.getByText("有更新")).toBeTruthy();
    expect(screen.getByText("已是最新")).toBeTruthy();
    expect(screen.getByText("出错")).toBeTruthy();
  });
  it("click status chip sets filterStatus", () => {
    render(<MergedFilterChip />);
    fireEvent.click(screen.getByText("有更新"));
    expect(filterStatus.value).toBe("update");
  });
  it("search input sets searchQuery", () => {
    render(<MergedFilterChip />);
    fireEvent.input(screen.getByPlaceholderText("搜索 app 名称..."), { target: { value: "vs" } });
    expect(searchQuery.value).toBe("vs");
  });
});