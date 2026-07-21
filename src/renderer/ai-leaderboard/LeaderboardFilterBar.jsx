/**
 * src/renderer/ai-leaderboard/LeaderboardFilterBar.jsx
 *
 * 对齐 ai-leaderboard-redesign-preview：分段视角切换 + 工具栏（左筛选 / 右搜索刷新）
 */
import { useState } from "preact/hooks";
import {
  activeView,
  activeBoard,
  activeVendor,
  licenseFilter,
  searchQuery,
  loading,
  setView,
  setBoard,
  setVendor,
  setLicenseFilter,
  setSearchQuery,
  clearSearchQuery,
  refresh,
} from "./aiLeaderboardStore.js";
import { VIEW_KEYS, VIEWS, ARENA_BOARD_KEYS, ARENA_BOARDS, VENDOR_OPTIONS, LICENSE_FILTER_OPTIONS } from "./types.js";

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

  const view = activeView.value;

  return (
    <div class="ai-leaderboard-filter-bar">
      <div class="ai-leaderboard-view-switch" role="tablist" aria-label="数据视角">
        {VIEW_KEYS.map((key) => {
          const meta = VIEWS[key];
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              class={`ai-leaderboard-seg ai-leaderboard-seg--${key}${active ? " is-active" : ""}`}
              onClick={() => setView(key)}
            >
              <span class="ai-leaderboard-seg__main">
                <span class="ai-leaderboard-seg__dot" aria-hidden="true" />
                {meta.label}
              </span>
              <span class="ai-leaderboard-seg__sub">{meta.segSub}</span>
            </button>
          );
        })}
      </div>

      <div class="ai-leaderboard-toolbar-row">
        <div class="ai-leaderboard-toolbar__left">
          {view === "arena" && (
            <div class="ai-leaderboard-chips" role="group" aria-label="Arena 分类">
              {ARENA_BOARD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  class={`ai-leaderboard-chip${activeBoard.value === key ? " is-active" : ""}`}
                  aria-pressed={activeBoard.value === key}
                  onClick={() => setBoard(key)}
                >
                  {ARENA_BOARDS[key].label}
                </button>
              ))}
            </div>
          )}

          <div class="ai-leaderboard-chips" role="group" aria-label="许可筛选">
            {LICENSE_FILTER_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                class={`ai-leaderboard-chip${licenseFilter.value === o.key ? " is-active" : ""}`}
                aria-pressed={licenseFilter.value === o.key}
                onClick={() => setLicenseFilter(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div class="ai-leaderboard-toolbar__right">
          <label class="ai-leaderboard-select ai-leaderboard-select--toolbar">
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
            class="ai-leaderboard-refresh ai-leaderboard-refresh--primary"
            onClick={() => refresh()}
            disabled={loading.value}
          >
            {loading.value ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LeaderboardFilterBar;