/**
 * src/renderer/games/GamesFilterBar.jsx — 浏览维度 (折扣力度 / 喜+1 / 热门Top10) + 折扣门槛/排序 + 刷新。
 */
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
} from "./gamesStore.js";

export function GamesFilterBar() {
  const mode = activeMode.value;
  return (
    <div class="games-filter-bar">
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
        <button
          type="button"
          class="games-refresh"
          onClick={() => loadGameDeals()}
          disabled={loading.value}
        >
          {loading.value ? "刷新中…" : "刷新"}
        </button>
      </div>
    </div>
  );
}
