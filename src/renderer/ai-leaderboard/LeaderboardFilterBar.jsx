/**
 * src/renderer/ai-leaderboard/LeaderboardFilterBar.jsx
 *
 * 分类 Tabs（LLM / 多模态 / 代码 / 图像 / 视频）→ setCategory
 * + 维度 Select → setDimension
 * + 厂商 Select → setVendor
 * + 排序方向 → setSortDir（本地派生）
 * + 搜索框 → setSearchQuery（200ms 防抖，本地派生）
 * + 刷新按钮 → refresh()
 */
import { useState } from "preact/hooks";
import {
  activeCategory,
  activeDimension,
  activeVendor,
  sortDir,
  searchQuery,
  loading,
  setCategory,
  setDimension,
  setVendor,
  setSortDir,
  setSearchQuery,
  clearSearchQuery,
  refresh,
} from "./aiLeaderboardStore.js";
import { CATEGORIES, CATEGORY_META, DIMENSIONS, DIMENSION_META, VENDOR_OPTIONS, isCategoryComingSoon } from "./types.js";

export function LeaderboardFilterBar() {
  const [q, setQ] = useState(searchQuery.value);

  function onSearch(e) {
    const v = e.currentTarget.value;
    setQ(v);
    setSearchQuery(v);
  }
  function onClear() {
    setQ("");
    clearSearchQuery();
  }
  function onSearchKey(e) {
    if (e.key === "Escape" && q) {
      e.preventDefault();
      onClear();
    }
  }

  return (
    <div class="ai-leaderboard-filter-bar">
      <div class="ai-leaderboard-tabs" role="tablist" aria-label="模型分类">
        {CATEGORIES.map((key) => {
          const meta = CATEGORY_META[key];
          const active = activeCategory.value === key;
          const comingSoon = isCategoryComingSoon(key);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={comingSoon ? "true" : undefined}
              title={comingSoon ? "该分类榜单暂未上线，敬请期待" : undefined}
              class={`ai-leaderboard-tab${active ? " is-active" : ""}${comingSoon ? " is-coming-soon" : ""}`}
              disabled={comingSoon}
              onClick={() => {
                if (comingSoon) return;
                setCategory(key);
              }}
            >
              <span class="ai-leaderboard-tab__emoji" aria-hidden="true">{meta.emoji}</span>
              <span class="ai-leaderboard-tab__label">{meta.label}</span>
              {comingSoon && (
                <span class="ai-leaderboard-tab__badge" aria-label="即将上线">
                  即将上线
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div class="ai-leaderboard-filter-extra">
        <label class="ai-leaderboard-select">
          <span class="ai-leaderboard-select__label">维度</span>
          <select
            class="ai-leaderboard-select__input"
            value={activeDimension.value}
            onChange={(e) => setDimension(e.currentTarget.value)}
          >
            {DIMENSIONS.map((key) => (
              <option key={key} value={key}>{DIMENSION_META[key].label}</option>
            ))}
          </select>
        </label>

        <label class="ai-leaderboard-select">
          <span class="ai-leaderboard-select__label">厂商</span>
          <select
            class="ai-leaderboard-select__input"
            value={activeVendor.value}
            onChange={(e) => setVendor(e.currentTarget.value)}
          >
            {VENDOR_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          class={`ai-leaderboard-sortdir${sortDir.value === "asc" ? " is-asc" : ""}`}
          aria-label={sortDir.value === "asc" ? "当前升序，点击切降序" : "当前降序，点击切升序"}
          title={sortDir.value === "asc" ? "升序排列" : "降序排列"}
          onClick={() => setSortDir(sortDir.value === "asc" ? "desc" : "asc")}
        >
          {sortDir.value === "asc" ? "↑ 升序" : "↓ 降序"}
        </button>

        <div class="ai-leaderboard-search" role="search">
          <span class="ai-leaderboard-search__icon" aria-hidden="true">🔍</span>
          <input
            id="ai-leaderboard-search-input"
            type="search"
            class="ai-leaderboard-search__input"
            role="searchbox"
            aria-label="搜索模型"
            aria-controls="ai-leaderboard-table"
            placeholder="搜索模型 / 厂商…"
            value={q}
            onInput={onSearch}
            onKeyDown={onSearchKey}
          />
          {q && (
            <button
              type="button"
              class="ai-leaderboard-search__clear"
              aria-label="清除搜索"
              onClick={onClear}
            >
              ×
            </button>
          )}
        </div>

        <button
          type="button"
          class="ai-leaderboard-refresh"
          onClick={() => refresh()}
          disabled={loading.value}
        >
          {loading.value ? "刷新中…" : "刷新"}
        </button>
      </div>
    </div>
  );
}

export default LeaderboardFilterBar;
