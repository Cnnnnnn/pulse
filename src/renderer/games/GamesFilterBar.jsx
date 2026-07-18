/**
 * src/renderer/games/GamesFilterBar.jsx — 浏览维度 (折扣力度 / 免费活动 / 心愿单 / 比价) + 标题搜索 + 折扣门槛/排序 + 刷新。
 */
import { useState } from "preact/hooks";
import {
  MODES,
  SAVINGS_TIERS,
  activeMode,
  setMode,
  minSavings,
  setMinSavings,
  activeSort,
  setSort,
  loading,
  loadGameDeals,
  setSearchQuery,
  clearSearchQuery,
  searchQuery,
} from "./gamesStore.js";

export function GamesFilterBar() {
  const mode = activeMode.value;
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
    <div class="games-filter-bar">
      <div class="games-search" role="search">
        <span class="games-search__icon" aria-hidden="true">🔍</span>
        <input
          id="games-search-input"
          type="search"
          class="games-search__input"
          role="searchbox"
          aria-label="搜索游戏"
          aria-controls="games-grid"
          aria-keyshortcuts="/"
          placeholder="搜索游戏名…"
          value={q}
          onInput={onSearch}
          onKeyDown={onSearchKey}
        />
        {q && (
          <button
            type="button"
            class="games-search__clear"
            aria-label="清除搜索"
            onClick={onClear}
          >
            ×
          </button>
        )}
      </div>

      <div class="games-mode-chips" role="group" aria-label="浏览维度">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              class={`games-chip${active ? " is-active" : ""}`}
              aria-pressed={active}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div class="games-filter-extra">
        {mode === "deals" && (
          <>
            <label class="games-select">
              <span class="games-select__label">折扣门槛</span>
              <select
                class="games-select__input"
                value={String(minSavings.value)}
                onChange={(e) => setMinSavings(Number(e.currentTarget.value))}
              >
                {SAVINGS_TIERS.map((t) => (
                  <option key={t.key} value={String(t.key)}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label class="games-select">
              <span class="games-select__label">排序</span>
              <select
                class="games-select__input"
                value={activeSort.value}
                onChange={(e) => setSort(e.currentTarget.value)}
              >
                <option value="savings">折扣力度</option>
                <option value="price">价格最低</option>
                <option value="rating">评分最高</option>
              </select>
            </label>
          </>
        )}
        {mode !== "wishlist" && (
          <button
            type="button"
            class="games-refresh"
            onClick={() => loadGameDeals()}
            disabled={loading.value}
          >
            {loading.value ? "刷新中…" : "刷新"}
          </button>
        )}
      </div>
    </div>
  );
}
