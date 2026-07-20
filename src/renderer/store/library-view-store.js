/**
 * src/renderer/library-view-store.js
 *
 * Library view 的 view/filter 状态. filterStatus / filterCategory / searchQuery
 * 直接 alias 到 store/ui-store.js 和 store/category-mute-store.js 的 signal
 * (同一引用, 同一 reactivity), 确保 MergedFilterChip / ResultsView / AppRow
 * 等无论从哪条路径写入, 另一条路径读到的是同一个值.
 *
 * viewMode 是 Library 独立的新字段 (table / card 视图切换), 旧版没保留语义.
 *
 * ponytail: 不替换 ui-store 旧字段, 旧 ResultsView / AppRow 仍走 ui-store;
 *          新 MergedFilterChip / 后续 LibraryPage 子组件走本 store (同一 signal).
 */
import { signal } from "@preact/signals";
import { activeFilter as filterStatus, searchQuery } from "./ui-store.js";
import { activeCategory as filterCategory } from "./category-mute-store.js";

export { filterStatus, filterCategory, searchQuery };
export const viewMode = signal("table");

export function setViewMode(mode) {
  if (mode === "table" || mode === "card") viewMode.value = mode;
}
export function setFilterStatus(s) {
  filterStatus.value = s;
}
export function setFilterCategory(c) {
  filterCategory.value = c;
}
export function setSearchQuery(q) {
  searchQuery.value = q;
}
export function resetLibraryFilters() {
  viewMode.value = "table";
  filterStatus.value = "all";
  filterCategory.value = "all";
  searchQuery.value = "";
}
