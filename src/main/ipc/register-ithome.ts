// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

const ithomeNewsStore = require("../ithome/news-store");
const { summarizeArticle } = require("../ithome/article-ai");

function registerIthomeHandlers(ctx) {
  const { safeHandle, getConfig } = ctx;

  function runKeywordWatchlistFromNews(news) {
    try {
      const articles =
        news && news.articles && typeof news.articles === "object"
          ? Object.values(news.articles)
          : [];
      const headlines = articles
        .filter((a: any) => a && typeof a.title === "string")
        .map((a: any) => ({ title: a.title }));
      const {
        checkWatchlistKeywordUpdates,
        makeWatchlistSendNotification,
      } = require("../watchlist");
      checkWatchlistKeywordUpdates({
        headlines,
        sendNotification: makeWatchlistSendNotification(getConfig),
      });
    } catch {
      /* noop */
    }
  }

  safeHandle("ithome:load-news", async () => ithomeNewsStore.loadAll());

  safeHandle("ithome:refresh-news", async (_evt, dateKey) => {
    const out = dateKey
      ? await ithomeNewsStore.fetchDay(dateKey)
      : await ithomeNewsStore.refresh();
    if (out && out.ok !== false) {
      const all = await ithomeNewsStore.loadAll();
      runKeywordWatchlistFromNews(all);
    }
    return out;
  });

  safeHandle("ithome:fetch-day", async (_evt, dateKey) =>
    ithomeNewsStore.fetchDay(dateKey),
  );

  safeHandle("ithome:summarize-article", async (_evt, payload) =>
    summarizeArticle(payload || {}),
  );

  safeHandle("ithome:toggle-favorite", async (_evt, payload) => {
    const id = payload && payload.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return ithomeNewsStore.toggleFavorite(id);
  });

  safeHandle("ithome:mark-read", async (_evt, id) => {
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return ithomeNewsStore.markArticleRead(id);
  });
}

module.exports = { registerIthomeHandlers };
