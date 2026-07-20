/**
 * src/renderer/ai-leaderboard/LeaderboardFilterBar.jsx
 *
 * v3.0 双视角筛选栏：
 *  - 视角切换 tabs（Arena 排名 / 深度分析）
 *  - Arena 视角：board chips（文本 / 多模态 / 代码）
 *  - AA 视角：维度 select（智能指数 / 代码 / Agent / 速度 / 价格）
 *  - 通用：厂商 select + 排序方向 + 搜索 + 刷新
 */
import { useState } from "preact/hooks";
import {
  activeView,
  activeBoard,
  activeDim,
  activeLB,
  activeVendor,
  sortDir,
  searchQuery,
  loading,
  setView,
  setBoard,
  setDim,
  setLB,
  setVendor,
  setSortDir,
  setSearchQuery,
  clearSearchQuery,
  refresh,
} from "./aiLeaderboardStore.js";
import { VIEW_KEYS, VIEWS, ARENA_BOARD_KEYS, ARENA_BOARDS, AA_DIMENSION_KEYS, AA_DIMENSIONS, LIVE_DIMENSION_KEYS, LIVE_DIMENSIONS, VENDOR_OPTIONS } from "./types.js";

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
      {/* 视角切换 */}
      <div class="ai-leaderboard-tabs" role="tablist" aria-label="数据视角">
        {VIEW_KEYS.map((key) => {
          const meta = VIEWS[key];
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              class={`ai-leaderboard-tab${active ? " is-active" : ""}`}
              onClick={() => setView(key)}
            >
              <span class="ai-leaderboard-tab__emoji" aria-hidden="true">{meta.emoji}</span>
              <span class="ai-leaderboard-tab__label">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div class="ai-leaderboard-filter-extra">
        {/* Arena 视角：board chips */}
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

        {/* AA 视角：维度选择 */}
        {view === "aa" && (
          <label class="ai-leaderboard-select">
            <span class="ai-leaderboard-select__label">排序</span>
            <select
              class="ai-leaderboard-select__input"
              value={activeDim.value}
              onChange={(e) => setDim(e.currentTarget.value)}
            >
              {AA_DIMENSION_KEYS.map((key) => (
                <option key={key} value={key}>{AA_DIMENSIONS[key].label}</option>
              ))}
            </select>
          </label>
        )}

        {/* LiveBench 视角：子维度选择 */}
        {view === "livebench" && (
          <label class="ai-leaderboard-select">
            <span class="ai-leaderboard-select__label">排序</span>
            <select
              class="ai-leaderboard-select__input"
              value={activeLB.value}
              onChange={(e) => setLB(e.currentTarget.value)}
            >
              {LIVE_DIMENSION_KEYS.map((key) => (
                <option key={key} value={key}>{LIVE_DIMENSIONS[key].label}</option>
              ))}
            </select>
          </label>
        )}

        {/* 厂商筛选 */}
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

        {/* 排序方向 */}
        <button
          type="button"
          class={`ai-leaderboard-sortdir${sortDir.value === "asc" ? " is-asc" : ""}`}
          aria-label={sortDir.value === "asc" ? "当前升序，点击切降序" : "当前降序，点击切升序"}
          title={sortDir.value === "asc" ? "升序排列" : "降序排列"}
          onClick={() => setSortDir(sortDir.value === "asc" ? "desc" : "asc")}
        >
          {sortDir.value === "asc" ? "↑ 升序" : "↓ 降序"}
        </button>

        {/* 搜索 */}
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

        {/* 刷新 */}
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
