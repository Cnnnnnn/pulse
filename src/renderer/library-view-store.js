/**
 * src/renderer/library-view-store.js
 *
 * Library view 的 view/filter 状态. 跟现有 store.js 的 searchQuery / activeFilter
 * 字段语义一致 (供 selectors 复用), 但独立信号便于 Library 重构后解耦.
 *
 * ponytail: 不替换 store.js 的旧字段, 新 LibraryPage 用本 store;
 *          旧 ResultsView 仍走 store.js (迁移期间共存).
 */
import { signal } from "@preact/signals";

export const viewMode = signal("table");
export const filterStatus = signal("all");
export const filterCategory = signal("all");
export const searchQuery = signal("");

export function setViewMode(mode) {
  if (mode === "table" || mode === "card") viewMode.value = mode;
}
export function setFilterStatus(s) { filterStatus.value = s; }
export function setFilterCategory(c) { filterCategory.value = c; }
export function setSearchQuery(q) { searchQuery.value = q; }
export function resetLibraryFilters() {
  viewMode.value = "table";
  filterStatus.value = "all";
  filterCategory.value = "all";
  searchQuery.value = "";
}