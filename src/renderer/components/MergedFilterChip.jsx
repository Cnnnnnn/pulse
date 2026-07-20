/**
 * src/renderer/components/MergedFilterChip.jsx
 *
 * 单行 chip 集合：search input + 4 status chip + N category chip + reset button.
 * 取代原 FilterBar.jsx + CategoryTabs.jsx (Task 14 删除).
 */
import {
  searchQuery, setSearchQuery,
  filterStatus, setFilterStatus,
  filterCategory, setFilterCategory,
  resetLibraryFilters,
} from "../store/library-view-store.js";
import { tabCounts } from "../selectors.js";
import { results } from "../store.js";
import { getCategoryTabsWithCount } from "../../config/category.js";
import { IconSearch } from "./icons.jsx";

const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "update", label: "有更新" },
  { key: "latest", label: "已是最新" },
  { key: "error", label: "出错" },
];

export function MergedFilterChip() {
  const counts = tabCounts.value;
  // ponytail: results 是 signal, 用其 value 喂 getCategoryTabsWithCount.
  // 空 Map 时函数仍返 "全部" + "其他" (count=0 的隐藏) — 不会崩, UI 只是少展示.
  // 过滤掉 id='all' — 跟 status chip "全部" 重复.
  const categories = getCategoryTabsWithCount(results.value).filter((c) => c.id !== "all");
  const activeStatus = filterStatus.value;
  const activeCat = filterCategory.value;

  return (
    <div class="merged-filter">
      <div class="merged-filter-search">
        <IconSearch size={14} />
        <input
          type="text"
          placeholder="搜索 app 名称..."
          value={searchQuery.value}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          aria-label="搜索 app 名称"
        />
        {searchQuery.value && (
          <button
            type="button"
            class="merged-filter-clear"
            onClick={() => setSearchQuery("")}
            aria-label="清空"
          >×</button>
        )}
      </div>
      <div class="merged-filter-chips" role="group" aria-label="状态筛选">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            class={`merged-filter-chip${activeStatus === t.key ? " active" : ""}`}
            onClick={() => setFilterStatus(t.key)}
            aria-pressed={activeStatus === t.key}
          >
            {t.label} <span class="merged-filter-count">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>
      <div class="merged-filter-chips" role="group" aria-label="分类筛选">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            class={`merged-filter-chip${activeCat === c.id ? " active" : ""}`}
            onClick={() => setFilterCategory(c.id)}
            aria-pressed={activeCat === c.id}
          >
            {c.name}
          </button>
        ))}
      </div>
      {(activeStatus !== "all" || activeCat !== "all" || searchQuery.value) && (
        <button
          type="button"
          class="merged-filter-reset"
          onClick={resetLibraryFilters}
        >
          清除过滤
        </button>
      )}
    </div>
  );
}

export default MergedFilterChip;