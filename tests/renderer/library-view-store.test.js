import { describe, it, expect, beforeEach } from "vitest";
import {
  viewMode, filterStatus, filterCategory, searchQuery,
  setViewMode, setFilterStatus, setFilterCategory, setSearchQuery, resetLibraryFilters,
} from "../../src/renderer/library-view-store.js";

beforeEach(() => {
  setViewMode("table");
  setFilterStatus("all");
  setFilterCategory("all");
  setSearchQuery("");
});

describe("library-view-store", () => {
  it("默认 table + all + all", () => {
    expect(viewMode.value).toBe("table");
    expect(filterStatus.value).toBe("all");
    expect(filterCategory.value).toBe("all");
  });
  it("setViewMode 接受 table/card", () => {
    setViewMode("card");
    expect(viewMode.value).toBe("card");
    setViewMode("invalid");
    expect(viewMode.value).toBe("card"); // 不变
  });
  it("setFilterStatus 接受 4 种", () => {
    setFilterStatus("update");
    expect(filterStatus.value).toBe("update");
  });
  it("setFilterCategory", () => {
    setFilterCategory("dev");
    expect(filterCategory.value).toBe("dev");
  });
  it("setSearchQuery", () => {
    setSearchQuery("vs");
    expect(searchQuery.value).toBe("vs");
  });
  it("resetLibraryFilters 全部归位", () => {
    setViewMode("card"); setFilterStatus("update"); setFilterCategory("dev"); setSearchQuery("foo");
    resetLibraryFilters();
    expect(viewMode.value).toBe("table");
    expect(filterStatus.value).toBe("all");
    expect(filterCategory.value).toBe("all");
    expect(searchQuery.value).toBe("");
  });
});