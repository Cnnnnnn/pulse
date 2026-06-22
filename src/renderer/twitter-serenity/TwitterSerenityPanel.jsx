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

  // 从 main 拉最新 cache 状态并刷 signals. refresh / paste / 初始挂载都复用.
  function loadFromServer() {
    return Promise.resolve(api.twitterList())
      .then((r) => {
        if (r && r.tweets) serenityTweets.value = r.tweets;
        serenityLastFetchedAt.value = r && r.lastFetchedAt;
        serenityDegraded.value = r && r.degraded;
      })
      .catch((e) => {
        serenityError.value = (e && e.message) || String(e);
      });
  }

  useEffect(() => {
    let mounted = true;
    serenityLoading.value = true;
    loadFromServer().finally(() => {
      if (mounted) serenityLoading.value = false;
    });

    // 实时事件订阅: main 后台 fetch 完成或 degraded 时推送, 同步刷 signals.
    const offUpdated = api.onTwitterUpdated
      ? api.onTwitterUpdated((data) => {
          if (!mounted) return;
          if (data && data.tweets) serenityTweets.value = data.tweets;
          if (data && data.lastFetchedAt)
            serenityLastFetchedAt.value = data.lastFetchedAt;
          serenityDegraded.value = false;
        })
      : null;
    const offDegraded = api.onTwitterDegraded
      ? api.onTwitterDegraded((data) => {
          if (!mounted) return;
          serenityDegraded.value = true;
          // degraded 时也重新拉一次, 拿 main 的 lastFetchedAt
          loadFromServer();
        })
      : null;

    return () => {
      mounted = false;
      // preload.js 的事件 listener 返回的是解绑函数; 若非函数则 noop
      if (typeof offUpdated === "function") offUpdated();
      if (typeof offDegraded === "function") offDegraded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    serenityLoading.value = true;
    try {
      await api.twitterFetch();
    } catch {
      /* noop, loadFromServer 会反映状态 */
    }
    // fetch 完成后重新拉 cache, 刷新 UI (fetch 返回值不含完整 cache 结构)
    await loadFromServer();
    serenityLoading.value = false;
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
      await loadFromServer();
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
