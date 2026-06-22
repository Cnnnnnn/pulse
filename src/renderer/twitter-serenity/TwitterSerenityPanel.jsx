/**
 * src/renderer/twitter-serenity/TwitterSerenityPanel.jsx
 *
 * Serenity 面板顶层层 (spec §6.2):
 *   状态条 (上次拉取时间 / 数量) + 强制刷新 + 降级横幅 + 手动粘贴 + TweetList.
 */

import { useEffect, useState } from "preact/hooks";
import {
  serenityTweets,
  serenityLoading,
  serenityError,
  serenityLastFetchedAt,
  serenityDegraded,
} from "./store.js";
import { api } from "../api.js";
import { SerenityTweetList } from "./SerenityTweetList.jsx";

function minsAgo(iso) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return `${m} 分钟前`;
}

export function TwitterSerenityPanel() {
  const tweets = serenityTweets.value;
  const loading = serenityLoading.value;
  const error = serenityError.value;
  const lastFetchedAt = serenityLastFetchedAt.value;
  const degraded = serenityDegraded.value;
  const [translations, setTranslations] = useState({});
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    let mounted = true;
    serenityLoading.value = true;
    api
      .twitterList()
      .then((r) => {
        if (!mounted) return;
        if (r && r.tweets) serenityTweets.value = r.tweets;
        serenityLastFetchedAt.value = r && r.lastFetchedAt;
        serenityDegraded.value = r && r.degraded;
        serenityLoading.value = false;
      })
      .catch((e) => {
        if (!mounted) return;
        serenityError.value = e.message || String(e);
        serenityLoading.value = false;
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function refresh() {
    serenityLoading.value = true;
    try {
      const r = await api.twitterFetch();
      if (r && r.tweets) serenityTweets.value = r.tweets;
    } finally {
      serenityLoading.value = false;
    }
  }

  async function handleTranslate(tweet) {
    const r = await api.twitterTranslate(tweet);
    if (r && r.ok) {
      setTranslations((prev) => ({ ...prev, [r.id]: r.zh }));
    }
  }

  async function handlePaste() {
    const r = await api.twitterManualPaste(pasteText);
    if (r && r.results && r.results.length) {
      setPasteText("");
      setShowPasteBox(false);
      const list = await api.twitterList();
      if (list && list.tweets) serenityTweets.value = list.tweets;
    }
  }

  return (
    <div class="serenity-panel">
      <header class="serenity-status-bar">
        <span>
          {minsAgo(lastFetchedAt) || "未拉取"} · 共 {tweets.length} 条
        </span>
        <button
          type="button"
          class="serenity-refresh"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "刷新中…" : "强制刷新"}
        </button>
      </header>

      {degraded && (
        <div class="serenity-degraded-banner">
          <span>镜像源不可用</span>
          <button type="button" onClick={() => setShowPasteBox(!showPasteBox)}>
            点击手动粘贴
          </button>
        </div>
      )}

      {showPasteBox && (
        <div class="serenity-paste-box">
          <textarea
            value={pasteText}
            onInput={(e) => setPasteText(e.target.value)}
            placeholder="粘贴推文链接或原文 (每行一条)"
            rows={4}
          />
          <button type="button" onClick={handlePaste}>
            提交
          </button>
        </div>
      )}

      {error && <div class="serenity-error">加载失败: {error}</div>}

      <SerenityTweetList
        tweets={tweets}
        translations={translations}
        onTranslate={handleTranslate}
      />
    </div>
  );
}
