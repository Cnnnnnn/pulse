/**
 * src/renderer/twitter-serenity/SerenityTweetDetail.jsx
 *
 * 单条推文卡片 (spec §6.2): 头像+名字+相对时间+文本,
 * 默认显示译文 (有则), hover/按钮切原文. metrics + 原文链接.
 */

import { useState } from "preact/hooks";
import { api } from "../api.js";

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SerenityTweetDetail({ tweet, translatedZh, onTranslated }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [err, setErr] = useState(null);

  async function doTranslate() {
    if (translatedZh) return;
    setTranslating(true);
    setErr(null);
    try {
      const r = await api.twitterTranslate(tweet);
      if (r && r.ok) {
        onTranslated(tweet.id, r.zh);
      } else {
        setErr((r && r.error) || "translate failed");
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setTranslating(false);
    }
  }

  const display = showOriginal ? tweet.text : translatedZh || tweet.text;
  const isTranslated = !!translatedZh && !showOriginal;
  const author = tweet.author || {};

  return (
    <article class="serenity-tweet">
      <header class="serenity-tweet-header">
        <span class="serenity-tweet-author">
          {author.displayName || author.handle || "unknown"}
        </span>
        <span class="serenity-tweet-time">
          {timeAgo(tweet.publishedAt || tweet.fetchedAt)}
        </span>
      </header>
      <p class="serenity-tweet-text">
        {display}
        {isTranslated && (
          <span class="serenity-tweet-translated-tag"> · AI 译文</span>
        )}
      </p>
      <footer class="serenity-tweet-footer">
        {tweet.metrics && (
          <span class="serenity-tweet-metrics">
            💬 {tweet.metrics.replies || 0} ↩ {tweet.metrics.retweets || 0} ❤️{" "}
            {tweet.metrics.likes || 0}
          </span>
        )}
        {tweet.url && (
          <a
            class="serenity-tweet-link"
            href={tweet.url}
            target="_blank"
            rel="noreferrer"
          >
            原文
          </a>
        )}
      </footer>
      <div class="serenity-tweet-actions">
        {!translatedZh && !translating && (
          <button type="button" class="serenity-translate-btn" onClick={doTranslate}>
            翻译
          </button>
        )}
        {translating && <span class="serenity-translating">翻译中…</span>}
        {err && (
          <span class="serenity-translate-error">翻译失败,点击重试</span>
        )}
        {translatedZh && (
          <button
            type="button"
            class="serenity-toggle-original"
            onClick={() => setShowOriginal(!showOriginal)}
          >
            {showOriginal ? "看译文" : "看原文"}
          </button>
        )}
      </div>
    </article>
  );
}
