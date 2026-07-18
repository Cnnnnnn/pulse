/**
 * src/renderer/ithome/NewsArticleRow.jsx — 资讯卡片行
 */

import { useState } from "preact/hooks";
import {
  ithomeSummaries,
  ithomeFavorites,
  ithomeReadIds,
  ithomeNewIds,
  ithomeSharingIds,
  ithomeComments,
  summarizeIthomeArticle,
  fetchIthomeComments,
  toggleIthomeFavorite,
  markIthomeRead,
  shareIthomeArticle,
} from "./store.js";
import { formatArticleTime, formatExcerptPreview } from "./news-utils.js";
import { NewsArticleSummary } from "./NewsArticleSummary.jsx";
import { NewsShareToast } from "./NewsShareToast.jsx";
import { refreshAIReadyStatus } from "../store.js";
import { PinIcon, IconSparkles, IconShare } from "../components/icons.jsx";

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
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [toast, setToast] = useState(null);

  if (!article) return null;

  const summary = ithomeSummaries.value[article.id];
  const hasSummary = !!(summary && summary.text);
  const favorited = !!ithomeFavorites.value[article.id];
  const isRead = !!ithomeReadIds.value[article.id];
  const isNew = !!ithomeNewIds.value[article.id];
  const sharing = !!ithomeSharingIds.value[article.id];
  const cachedComments = ithomeComments.value[article.id];
  const hasCachedComments = Object.prototype.hasOwnProperty.call(
    ithomeComments.value,
    article.id,
  );
  const timeLabel = formatArticleTime(article.pubDate);
  const excerptPreview = formatExcerptPreview(article.excerpt);

  async function openLink(e) {
    e.preventDefault();
    markIthomeRead(article.id);
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

  async function handleComments() {
    if (commentsLoading) return;
    if (commentsExpanded && hasCachedComments) {
      setCommentsExpanded(false);
      return;
    }
    setCommentsExpanded(true);
    if (hasCachedComments) return;
    setCommentError(null);
    setCommentsLoading(true);
    try {
      const result = await fetchIthomeComments(article.id);
      if (typeof console !== "undefined" && console.debug) {
        console.debug("[ithome] fetchComments", article.id, result);
      }
      if (!result || !result.ok) {
        setCommentError(
          result && result.reason
            ? `评论暂时无法加载（${result.reason}）`
            : "评论暂时无法加载",
        );
      }
    } catch (err) {
      setCommentError(
        err && err.message ? `评论暂时无法加载（${err.message}）` : "评论暂时无法加载",
      );
    } finally {
      setCommentsLoading(false);
    }
  }

async function handleShare(e) {
  e.preventDefault();
  e.stopPropagation();
  if (sharing) return;
  const r = await shareIthomeArticle(article.id);
  if (r && r.ok) {
    setToast({ kind: "success", message: "已复制到剪贴板,可 ⌘V 粘贴" });
  } else {
    const reason = r && r.reason;
    const message =
      reason === "article_not_found"
        ? "文章已过期,无法生成分享卡片"
        : reason === "no_summary"
          ? "暂无 AI 总结,请先生成"
          : "图片生成失败,请重试";
    setToast({ kind: "error", message });
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
      class={`ithome-row${favorited ? " is-favorited" : ""}${expanded ? " is-expanded" : ""}${isRead ? " is-read" : ""}${isNew ? " is-new" : ""}`}
      data-article-id={article.id}
    >
      <div class="ithome-row-head">
        <div class="ithome-row-meta">
          {timeLabel && <span class="ithome-row-time">{timeLabel}</span>}
          {article.category && (
            <span class="ithome-row-tag">{article.category}</span>
          )}
          {isNew && <span class="ithome-row-tag ithome-row-tag--new">新</span>}
          {isRead && <span class="ithome-row-tag ithome-row-tag--read">已读</span>}
        </div>
        <button
          type="button"
          class={`ithome-row-star${favorited ? " is-on" : ""}`}
          disabled={favBusy}
          onClick={handleToggleFavorite}
          title={favorited ? "取消收藏" : "收藏"}
          aria-label={favorited ? "取消收藏" : "收藏"}
        >
          <PinIcon filled={favorited} size={14} />
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
          <IconSparkles size={14} /> {aiLabel}
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
            class="ithome-row-link ithome-row-link--muted ithome-row-link--share"
            disabled={sharing}
            onClick={handleShare}
            aria-label="生成分享图片"
            title="生成分享图片"
          >
            {sharing ? "生成图片中…" : <><IconShare size={14} /> 分享</>}
          </button>
        )}
        <button
          type="button"
          class="ithome-row-link ithome-row-link--muted ithome-row-comments-trigger"
          onClick={handleComments}
          disabled={commentsLoading}
          aria-expanded={commentsExpanded}
        >
          {commentsLoading
            ? "评论加载中…"
            : commentsExpanded
              ? "收起评论"
              : "查看评论"}
        </button>
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

      {toast && (
        <NewsShareToast
          key={`${toast.kind}-${toast.message}`}
          message={toast.message}
          kind={toast.kind}
          onDone={() => setToast(null)}
        />
      )}

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
      {commentsExpanded && (() => {
        let body;
        if (commentsLoading) {
          body = <p class="ithome-row-comments-status">正在加载评论…</p>;
        } else if (commentError) {
          body = (
            <div class="ithome-row-comments-status is-error">
              <span>{commentError}</span>
              <button type="button" onClick={handleComments}>
                重试
              </button>
            </div>
          );
        } else if (hasCachedComments && cachedComments.length === 0) {
          body = <p class="ithome-row-comments-status">暂无热门评论</p>;
        } else if (hasCachedComments) {
          body = (
            <ol class="ithome-comment-list">
              {cachedComments.map((comment) => (
                <li key={comment.id} class="ithome-comment-item">
                  <div class="ithome-comment-meta">
                    <strong>{comment.author}</strong>
                    {comment.createdAt && <time>{comment.createdAt}</time>}
                    {comment.likes > 0 && <span>支持 {comment.likes}</span>}
                  </div>
                  <p>{comment.content}</p>
                </li>
              ))}
            </ol>
          );
        } else {
          body = (
            <p class="ithome-row-comments-status">正在准备评论…</p>
          );
        }
        return (
          <div class="ithome-row-comments" aria-live="polite">
            {body}
          </div>
        );
      })()}
    </article>
  );
}

export default NewsArticleRow;
