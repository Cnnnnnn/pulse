import { useEffect, useState } from "preact/hooks";
import {
  fetchIthomeArticleBody,
  ithomeFavorites,
  markIthomeRead,
  toggleIthomeFavorite,
} from "./store.ts";
import { formatArticleTime } from "./news-utils.ts";
import { IconExternalLink, IconRefresh, PinIcon } from "../components/icons.tsx";
import { NewsAnalysisPanel } from "./NewsAnalysisPanel.tsx";

const MIN_USEFUL_BODY_CHARS = 200;

function bodyText(article) {
  return String(article?.body || article?.excerpt || "").trim();
}

function splitParagraphs(text) {
  return text
    .split(/\n{2,}|\r\n|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function fetchReason(reason) {
  const labels = {
    article_not_found: "文章已过期，无法加载正文",
    fetch_failed: "正文加载失败，请稍后重试",
    parse_failed: "正文格式暂时无法解析",
    ipc_unavailable: "应用通信不可用，请重启后重试",
  };
  return labels[reason] || reason || "正文加载失败";
}

export function NewsReader({ article }) {
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const body = bodyText(article);
  const favorited = !!ithomeFavorites.value[article?.id];

  useEffect(() => {
    let active = true;
    if (!article?.id || body.length >= MIN_USEFUL_BODY_CHARS) {
      setBodyLoading(false);
      return undefined;
    }
    setBodyLoading(true);
    setBodyError("");
    void fetchIthomeArticleBody(article.id)
      .then((result) => {
        if (!active || (result && result.ok)) return;
        setBodyError(fetchReason(result && result.reason));
      })
      .catch((error) => {
        if (active) setBodyError(error?.message || "正文加载失败");
      })
      .finally(() => {
        if (active) setBodyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [article?.id, body]);

  async function handleFavorite() {
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      await toggleIthomeFavorite(article.id);
    } finally {
      setFavoriteBusy(false);
    }
  }

  function openOriginal() {
    void markIthomeRead(article.id);
    if (typeof window !== "undefined" && window.api?.openUrl) {
      void window.api.openUrl(article.link);
    } else if (article.link) {
      window.open(article.link, "_blank", "noopener");
    }
  }

  const paragraphs = splitParagraphs(body);

  return (
    <article class="ithome-reader">
      <header class="ithome-reader-head">
        <div class="ithome-reader-kicker">{article.category || "IT 新闻"}</div>
        <h1>{article.title}</h1>
        <div class="ithome-reader-meta">
          <span>{article.source || "IT之家"}</span>
          <span>·</span>
          <span>{formatArticleTime(article.pubDate) || "时间未知"}</span>
          {body.length >= MIN_USEFUL_BODY_CHARS && <span class="ithome-reader-body-status">正文已加载</span>}
        </div>
        <div class="ithome-reader-actions">
          <button type="button" class="ithome-reader-action is-primary" onClick={() => void markIthomeRead(article.id)}>
            标记已读
          </button>
          <button type="button" class="ithome-reader-action" onClick={() => void handleFavorite()} disabled={favoriteBusy}>
            <PinIcon filled={favorited} size={14} /> {favorited ? "已收藏" : "收藏"}
          </button>
          <button type="button" class="ithome-reader-action" onClick={openOriginal}>
            <IconExternalLink size={14} /> 打开原文
          </button>
        </div>
      </header>

      <div class="ithome-reader-body">
        {bodyLoading && (
          <div class="ithome-reader-loading">
            <IconRefresh size={14} /> 正在抓取正文…
          </div>
        )}
        {bodyError && (
          <div class="ithome-reader-error" role="alert">
            <span>{bodyError}</span>
            <button type="button" onClick={openOriginal}>打开原文</button>
          </div>
        )}
        {!bodyLoading && !bodyError && paragraphs.length === 0 && (
          <div class="ithome-reader-empty">暂无正文，建议打开原文查看。</div>
        )}
        {paragraphs.map((paragraph, index) => (
          <p key={`${article.id}-${index}`}>{paragraph}</p>
        ))}
      </div>

      <NewsAnalysisPanel article={article} />
    </article>
  );
}

export default NewsReader;
