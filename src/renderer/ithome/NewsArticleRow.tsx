/**
 * src/renderer/ithome/NewsArticleRow.tsx — 资讯卡片行
 *
 * 布局：左侧内容区（meta/标题/摘要/操作）+ 右侧缩略图（有 cover 才显）。
 * 无图自动降级为纯文字卡片。次操作（分享/重新生成/收藏）收进 ⋯ 菜单。
 */

import { useState, useRef, useEffect } from "preact/hooks";
import {
  ithomeSummaries,
  ithomeFavorites,
  ithomeReadIds,
  ithomeNewIds,
  ithomeSharingIds,
  summarizeIthomeArticle,
  toggleIthomeFavorite,
  markIthomeRead,
  shareIthomeArticle,
} from "./store.ts";
import { formatArticleTime, formatExcerptPreview } from "./news-utils.ts";
import { NewsShareToast } from "./NewsShareToast.tsx";
import { refreshAIReadyStatus } from "../store.ts";
import {
  PinIcon,
  IconSparkles,
  IconShare,
  IconMoreHorizontal,
  IconExternalLink,
  IconRefresh,
} from "../components/icons.tsx";

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

/** 右侧缩略图 — 抄 GameCard.GameThumb 范式：loading=lazy + onError 兜底 */
function ArticleCover({ src, alt }) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [src]);
  if (!src || imgError) return null;
  return (
    <img
      class="ithome-row-cover-img"
      src={src}
      alt={alt || ""}
      loading="lazy"
      onError={() => setImgError(true)}
    />
  );
}

/** 行内 ⋯ 菜单 — 抄 RemindersModal.RowOverflowMenu 范式 */
function ArticleRowMenu({ items, testid }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <span class="ithome-row-overflow" ref={wrapRef}>
      <button
        type="button"
        class="ithome-row-btn ithome-row-btn--ghost"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label="更多操作"
        aria-expanded={open}
        data-testid={testid}
      >
        <IconMoreHorizontal size={14} />
      </button>
      {open && (
        <ul class="ithome-row-overflow-menu" role="menu">
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                class={`ithome-row-overflow-item${it.danger ? " is-danger" : ""}${it.icon ? " has-icon" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export function NewsArticleRow({ article, isSelected = false, onSelect }) {
  const [busy, setBusy] = useState(false);
  const [fetchingBody, setFetchingBody] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  if (!article) return null;

  const summary = ithomeSummaries.value[article.id];
  const hasSummary = !!(summary && summary.text);
  const favorited = !!ithomeFavorites.value[article.id];
  const isRead = !!ithomeReadIds.value[article.id];
  const isNew = !!ithomeNewIds.value[article.id];
  const sharing = !!ithomeSharingIds.value[article.id];
  const timeLabel = formatArticleTime(article.pubDate);
  const excerptPreview = formatExcerptPreview(article.excerpt);
  const cover = article.cover || "";

  async function openLink(e) {
    e.preventDefault();
    e.stopPropagation();
    if (onSelect) {
      onSelect(article);
      return;
    }
    markIthomeRead(article.id);
    if (typeof window !== "undefined" && window.api?.openUrl) {
      await window.api.openUrl(article.link);
    } else if (article.link) {
      window.open(article.link, "_blank", "noopener");
    }
  }

  async function handleToggleFavorite(e?) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
      }
    } finally {
      setFetchingBody(false);
      setBusy(false);
    }
  }

  async function handleShare(e?) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
        ? "已分析"
        : "AI 总结";

  // ⋯ 菜单项：收藏常驻；分享/重新生成仅在已有摘要时出现
  const menuItems = [];
  menuItems.push({
    key: "fav",
    icon: <PinIcon filled={favorited} size={14} />,
    label: favorited ? "取消收藏" : "收藏",
    disabled: favBusy,
    onClick: () => handleToggleFavorite(),
  });
  if (hasSummary) {
    menuItems.push({
      key: "share",
      icon: <IconShare size={14} />,
      label: sharing ? "生成图片中…" : "分享卡片",
      disabled: sharing,
      onClick: () => handleShare(),
    });
    menuItems.push({
      key: "regen",
      icon: <IconRefresh size={14} />,
      label: "重新生成摘要",
      disabled: busy || fetchingBody,
      onClick: () => handleSummarize(true),
    });
  }

  return (
    <article
      class={`ithome-row${favorited ? " is-favorited" : ""}${isSelected ? " is-selected" : ""}${isRead ? " is-read" : ""}${isNew ? " is-new" : ""}${cover ? " has-cover" : ""}`}
      data-article-id={article.id}
      onClick={(e) => {
        if (!onSelect) return;
        const target = e.target as HTMLElement;
        if (target?.closest?.("button,a")) return;
        onSelect(article);
      }}
    >
      <div class="ithome-row-main">
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
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(article);
              void handleSummarize(false);
            }}
          >
            <IconSparkles size={14} /> {aiLabel}
          </button>
          <ArticleRowMenu items={menuItems} testid="ithome-row-menu" />
          <a
            class="ithome-row-link ithome-row-link--ext"
            href={article.link}
            onClick={openLink}
            title="阅读原文"
            aria-label="阅读原文"
          >
            <IconExternalLink size={14} />
          </a>
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

      </div>

      {cover && (
        <div class="ithome-row-cover">
          <ArticleCover src={cover} alt={article.title} />
        </div>
      )}
    </article>
  );
}

export default NewsArticleRow;
