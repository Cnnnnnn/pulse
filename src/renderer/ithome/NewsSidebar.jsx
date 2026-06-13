/**
 * src/renderer/ithome/NewsSidebar.jsx — 左侧日期列表
 */

import {
  ithomeViewMode,
  ithomeSelectedDate,
  ithomeFavoriteSelectedDate,
  ithomeArticles,
  ithomeFavorites,
  setIthomeSelectedDate,
  setIthomeFavoriteSelectedDate,
} from "./store.js";
import {
  monthDayRange,
  favoriteDateKeys,
  articlesForDate,
  favoritesForDate,
  isTodayDateKey,
  weekdayShort,
  currentMonthLabel,
} from "./news-utils.js";

function dayCount(dateKey, isFavorites, articles, favorites) {
  if (isFavorites) {
    return favoritesForDate(favorites, dateKey).length;
  }
  return articlesForDate(articles, dateKey).length;
}

export function NewsSidebar() {
  const mode = ithomeViewMode.value;
  const isFavorites = mode === "favorites";
  const articles = ithomeArticles.value;
  const favorites = ithomeFavorites.value;
  const selected = isFavorites
    ? ithomeFavoriteSelectedDate.value
    : ithomeSelectedDate.value;

  const days = isFavorites
    ? favoriteDateKeys(favorites)
    : monthDayRange().days;

  function handleSelect(dateKey) {
    if (isFavorites) {
      setIthomeFavoriteSelectedDate(dateKey);
    } else {
      setIthomeSelectedDate(dateKey);
    }
  }

  return (
    <aside class="ithome-sidebar" aria-label="日期列表">
      <div class="ithome-sidebar-head">
        <span class="ithome-sidebar-title">
          {isFavorites ? "收藏日期" : currentMonthLabel()}
        </span>
        <span class="ithome-sidebar-count">{days.length} 天</span>
      </div>
      <nav class="ithome-sidebar-list">
        {days.length === 0 && (
          <p class="ithome-sidebar-empty">暂无日期</p>
        )}
        {[...days].reverse().map((dateKey) => {
          const active = dateKey === selected;
          const today = isTodayDateKey(dateKey);
          const [, , d] = dateKey.split("-");
          const count = dayCount(dateKey, isFavorites, articles, favorites);
          return (
            <button
              key={dateKey}
              type="button"
              class={`ithome-sidebar-item${active ? " is-active" : ""}${today ? " is-today" : ""}`}
              onClick={() => handleSelect(dateKey)}
            >
              <span class="ithome-sidebar-item-main">
                <span class="ithome-sidebar-item-day">{Number(d)}日</span>
                <span class="ithome-sidebar-item-wd">
                  周{weekdayShort(dateKey)}
                  {today && (
                    <span class="ithome-sidebar-today">今天</span>
                  )}
                </span>
              </span>
              {count > 0 && (
                <span class="ithome-sidebar-item-badge">{count}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default NewsSidebar;
