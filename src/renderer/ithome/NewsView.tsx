/**
 * src/renderer/ithome/NewsView.jsx
 *
 * IT 新闻阅读工作台：左侧新闻队列 + 右侧正文 / AI 分析。
 * 队列只负责选择，不再承载可变高度的 inline AI 摘要。
 */

import { useEffect, useState } from "preact/hooks";

import {
  ithomeArticles,
  ithomeDayStats,
  ithomeNewsLoaded,
  ithomeNewsLoading,
  ithomeNewsError,
  ithomeSelectedDate,
  ithomeFavorites,
  ithomeFavoriteSelectedDate,
  ithomeViewMode,
  ithomeSummaries,
} from "./store.ts";
import {
  articlesForDate,
  favoritesForDate,
  formatDayHeader,
  favoriteCount,
  countSummarizedArticles,
  sidebarDayCount,
} from "./news-utils.ts";
import { NewsArticleRow } from "./NewsArticleRow.tsx";
import { NewsReader } from "./NewsReader.tsx";
import { markIthomeRead } from "./store.ts";
import { PinIcon, IconRefresh, IconNews } from "../components/icons.tsx";

function articleSearchText(article, summary) {
  return [
    article?.title,
    article?.excerpt,
    article?.body,
    article?.category,
    summary?.text,
    summary?.abstract,
    summary?.domain,
    summary?.impact,
    Array.isArray(summary?.keywords)
      ? summary.keywords.join(" ")
      : summary?.keywords,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function NewsView({ search = "", onRefresh }) {
  const [selectedArticleId, setSelectedArticleId] = useState("");
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
    return articleSearchText(a, ithomeSummaries.value[a.id]).includes(q);
  });

  const articleIds = articles.map((a) => a.id).join("|");
  useEffect(() => {
    if (articles.length === 0) {
      setSelectedArticleId("");
      return;
    }
    if (!articles.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(articles[0].id);
    }
  }, [articleIds, dateKey, mode, selectedArticleId, articles]);

  function handleSelectArticle(article) {
    if (!article) return;
    setSelectedArticleId(article.id);
    void markIthomeRead(article.id);
  }

  if (!loaded && loading) {
    return (
      <div class="ithome-panel-empty">
        <span class="ithome-panel-empty-spinner" aria-hidden="true" />
        <p class="ithome-panel-empty-title">正在加载</p>
      </div>
    );
  }

  if (isFavorites && favoriteCount(ithomeFavorites.value) === 0) {
    return (
      <div class="ithome-panel-empty">
        <span class="ithome-panel-empty-icon" aria-hidden="true">
          <PinIcon filled={false} size={28} />
        </span>
        <p class="ithome-panel-empty-title">还没有收藏</p>
        <p class="ithome-panel-empty-hint">
          在「本月新闻」中点击 <PinIcon filled={false} size={14} /> 即可加入收藏夹
        </p>
      </div>
    );
  }

  if (!dateKey) {
    return (
      <div class="ithome-panel-empty">
        <span class="ithome-panel-empty-icon" aria-hidden="true">
          <IconNews size={28} />
        </span>
        <p class="ithome-panel-empty-title">请选择日期</p>
        <p class="ithome-panel-empty-hint">从左侧选择一个日期查看资讯</p>
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
              : <>点击顶栏 <IconRefresh size={14} /> 拉取当日新闻</>}
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
  const displayCount = isFavorites
    ? sourceArticles.length
    : sidebarDayCount(
        ithomeDayStats.value,
        ithomeArticles.value,
        dateKey,
      );

  const selectedArticle = articles.find((article) => article.id === selectedArticleId);

  return (
    <div class="ithome-workspace">
      <section class="ithome-list-column" aria-label="新闻队列">
        <header class="ithome-panel-head">
          <h3 class="ithome-panel-title">{formatDayHeader(dateKey)}</h3>
          <span class="ithome-panel-meta">
            {q ? articles.length : displayCount} 篇
            {summaryCount > 0 && ` · ${summaryCount} 篇已分析`}
          </span>
        </header>
        <ul class="ithome-article-list">
          {articles.map((a) => (
            <li key={a.id}>
              <NewsArticleRow
                article={a}
                isSelected={a.id === selectedArticleId}
                onSelect={handleSelectArticle}
              />
            </li>
          ))}
        </ul>
      </section>
      <section class="ithome-reader-column" aria-label="文章阅读区">
        {selectedArticle ? (
          <NewsReader article={selectedArticle} />
        ) : (
          <div class="ithome-reader-placeholder">
            <IconNews size={28} />
            <p>选择一篇新闻开始阅读</p>
            <span>正文和 AI 分析会在这里保持同一阅读上下文</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default NewsView;
