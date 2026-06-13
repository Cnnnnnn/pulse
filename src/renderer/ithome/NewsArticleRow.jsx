/**
 * src/renderer/ithome/NewsArticleRow.jsx — 资讯卡片行
 */

import { useState } from "preact/hooks";
import {
  ithomeSummaries,
  ithomeFavorites,
  summarizeIthomeArticle,
  toggleIthomeFavorite,
} from "./store.js";
import { formatArticleTime, formatExcerptPreview } from "./news-utils.js";
import { NewsArticleSummary } from "./NewsArticleSummary.jsx";
import { refreshAIReadyStatus } from "../store.js";

function mapAiError(reason) {
  if (
    reason === "api_key_missing" ||
    reason === "config_missing" ||
    reason === "model_missing"
  ) {
    return "请先在侧栏「AI 配置」中保存 Provider、模型和 API Key";
  }
  return reason || "生成失败";
}

/** 与后端 article-page-fetcher MIN_USEFUL_BODY_CHARS 保持一致 */
const MIN_USEFUL_BODY_CHARS = 200;

function needsBodyFetch(article) {
  if (!article) return false;
  const body = (article.body || "").trim();
  if (body.length >= MIN_USEFUL_BODY_CHARS) return false;
  const excerpt = (article.excerpt || "").trim();
  if (excerpt.length >= MIN_USEFUL_BODY_CHARS) return false;
  return true;
}

export function NewsArticleRow({ article }) {
  const [busy, setBusy] = useState(false);
  const [fetchingBody, setFetchingBody] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  if (!article) return null;

  const summary = ithomeSummaries.value[article.id];
  const hasSummary = !!(summary && summary.text);
  const favorited = !!ithomeFavorites.value[article.id];
  const timeLabel = formatArticleTime(article.pubDate);
  const excerptPreview = formatExcerptPreview(article.excerpt);

  async function openLink(e) {
    e.preventDefault();
    if (typeof window !== "undefined" && window.api?.openUrl) {
      await window.api.openUrl(article.link);
    } else if (article.link) {
      window.open(article.link, "_blank", "noopener");
    }
  }

  async function handleToggleFavorite(e) {
    e.preventDefault();
    e.stopPropagation();
    if (favBusy) return;
    setFavBusy(true);
    try {
      await toggleIthomeFavorite(article.id);
    } finally {
      setFavBusy(false);
    }
  }

  async function handleSummarize(force = false) {
    if (hasSummary && !force) {
      setExpanded(!expanded);
      return;
    }
    const ready = await refreshAIReadyStatus();
    if (!ready) {
      setError("请先在侧栏「AI 配置」中保存 Provider、模型和 API Key");
      return;
    }
    setError(null);
    if (needsBodyFetch(article)) {
      setFetchingBody(true);
    } else {
      setBusy(true);
    }
    try {
      const r = await summarizeIthomeArticle(article.id, force);
      if (!r || !r.ok) {
        setError(mapAiError(r && r.reason));
      } else {
        setExpanded(true);
      }
    } finally {
      setFetchingBody(false);
      setBusy(false);
    }
  }

  const aiLabel = fetchingBody
    ? "抓取正文中…"
    : busy
      ? "总结中…"
      : hasSummary
        ? expanded
          ? "收起"
          : "摘要"
        : "AI 总结";

  return (
    <article
      class={`ithome-row${favorited ? " is-favorited" : ""}${expanded ? " is-expanded" : ""}`}
    >
      <div class="ithome-row-head">
        <div class="ithome-row-meta">
          {timeLabel && <span class="ithome-row-time">{timeLabel}</span>}
          {article.category && (
            <span class="ithome-row-tag">{article.category}</span>
          )}
        </div>
        <button
          type="button"
          class={`ithome-row-star${favorited ? " is-on" : ""}`}
          disabled={favBusy}
          onClick={handleToggleFavorite}
          title={favorited ? "取消收藏" : "收藏"}
          aria-label={favorited ? "取消收藏" : "收藏"}
        >
          {favorited ? "★" : "☆"}
        </button>
      </div>

      <a
        class="ithome-row-title"
        href={article.link}
        onClick={openLink}
        title={article.title}
      >
        {article.title}
      </a>

      {excerptPreview && (
        <p class="ithome-row-excerpt">{excerptPreview}</p>
      )}

      <div class="ithome-row-foot">
        <button
          type="button"
          class={`ithome-row-btn ithome-row-btn--ai${hasSummary ? " has-summary" : ""}`}
          disabled={busy || fetchingBody}
          onClick={() => handleSummarize(false)}
        >
          ✨ {aiLabel}
        </button>
        <a
          class="ithome-row-link"
          href={article.link}
          onClick={openLink}
        >
          阅读原文
        </a>
        {hasSummary && (
          <button
            type="button"
            class="ithome-row-link ithome-row-link--muted"
            disabled={busy || fetchingBody}
            onClick={() => handleSummarize(true)}
          >
            重新生成
          </button>
        )}
      </div>

      {error && <p class="ithome-row-error">{error}</p>}

      {hasSummary && expanded && (
        <div class="ithome-row-summary">
          <NewsArticleSummary summary={summary} />
        </div>
      )}
      {hasSummary && !expanded && (
        <button
          type="button"
          class="ithome-row-summary-preview"
          onClick={() => setExpanded(true)}
        >
          <NewsArticleSummary summary={summary} compact />
        </button>
      )}
    </article>
  );
}

export default NewsArticleRow;
