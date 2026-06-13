/**
 * src/renderer/ithome/NewsView.jsx
 */

import {
  ithomeArticles,
  ithomeNewsLoaded,
  ithomeNewsLoading,
  ithomeNewsError,
  ithomeSelectedDate,
  ithomeFavorites,
  ithomeFavoriteSelectedDate,
  ithomeViewMode,
  ithomeSummaries,
} from "./store.js";
import {
  articlesForDate,
  favoritesForDate,
  formatDayHeader,
  favoriteCount,
  countSummarizedArticles,
} from "./news-utils.js";
import { NewsArticleRow } from "./NewsArticleRow.jsx";

export function NewsView({ search = "", onRefresh }) {
  const loaded = ithomeNewsLoaded.value;
  const loading = ithomeNewsLoading.value;
  const error = ithomeNewsError.value;
  const mode = ithomeViewMode.value;
  const isFavorites = mode === "favorites";
  const dateKey = isFavorites
    ? ithomeFavoriteSelectedDate.value
    : ithomeSelectedDate.value;
  const q = (search || "").trim().toLowerCase();

  const sourceArticles = isFavorites
    ? favoritesForDate(ithomeFavorites.value, dateKey)
    : articlesForDate(ithomeArticles.value, dateKey);

  const articles = sourceArticles.filter((a) => {
    if (!q) return true;
    return (
      (a.title && a.title.toLowerCase().includes(q)) ||
      (a.excerpt && a.excerpt.toLowerCase().includes(q)) ||
      (a.category && a.category.toLowerCase().includes(q))
    );
  });

  if (!loaded && loading) {
    return (
      <div class="ithome-panel-empty">
        <p>正在加载…</p>
      </div>
    );
  }

  if (isFavorites && favoriteCount(ithomeFavorites.value) === 0) {
    return (
      <div class="ithome-panel-empty">
        <p class="ithome-panel-empty-title">还没有收藏</p>
        <p class="ithome-panel-empty-hint">
          在「本月新闻」中点击 ☆ 即可加入收藏夹
        </p>
      </div>
    );
  }

  if (!dateKey) {
    return (
      <div class="ithome-panel-empty">
        <p class="ithome-panel-empty-title">请选择日期</p>
      </div>
    );
  }

  if (!isFavorites && error && articles.length === 0) {
    return (
      <div class="ithome-panel-empty is-error">
        <p class="ithome-panel-empty-title">加载失败</p>
        <p class="ithome-panel-empty-hint">{error}</p>
        {onRefresh && (
          <button
            type="button"
            class="ithome-panel-empty-btn"
            onClick={() => onRefresh()}
          >
            重新拉取
          </button>
        )}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div class="ithome-panel-empty">
        <p class="ithome-panel-empty-title">
          {q
            ? `未找到「${search}」`
            : `${formatDayHeader(dateKey)} 暂无${isFavorites ? "收藏" : "资讯"}`}
        </p>
        <p class="ithome-panel-empty-hint">
          {q
            ? "试试其他关键词或切换左侧日期"
            : isFavorites
              ? "切换左侧其他日期查看"
              : "点击顶栏 ↻ 拉取当日新闻"}
        </p>
        {!isFavorites && !q && onRefresh && (
          <button
            type="button"
            class="ithome-panel-empty-btn"
            onClick={() => onRefresh()}
          >
            拉取资讯
          </button>
        )}
      </div>
    );
  }

  const summaryCount = countSummarizedArticles(
    articles,
    ithomeSummaries.value,
  );

  return (
    <div class="ithome-panel">
      <header class="ithome-panel-head">
        <h3 class="ithome-panel-title">{formatDayHeader(dateKey)}</h3>
        <span class="ithome-panel-meta">
          {articles.length} 篇
          {summaryCount > 0 && ` · ${summaryCount} 篇已总结`}
        </span>
      </header>
      <ul class="ithome-article-list">
        {articles.map((a) => (
          <li key={a.id}>
            <NewsArticleRow article={a} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default NewsView;
