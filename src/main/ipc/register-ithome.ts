// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

import * as ithomeNewsStore from "../ithome/news-store";
const _ns: any = ithomeNewsStore;
import { summarizeArticle } from "../ithome/article-ai";
import { fetchAndAttachBody } from "../ithome/article-page-fetcher";

export function registerIthomeHandlers(ctx: any) {
  const { safeHandle, getConfig } = ctx;

  function runKeywordWatchlistFromNews(news: any) {
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
      } = require("../watchlist.ts");
      checkWatchlistKeywordUpdates({
        headlines,
        sendNotification: makeWatchlistSendNotification(getConfig),
      });
    } catch {
      /* noop */
    }
  }

  safeHandle("ithome:load-news", async () => _ns.loadAll());

  safeHandle("ithome:refresh-news", async (_evt: any, dateKey: any) => {
    const out = dateKey
      ? await _ns.fetchDay(dateKey)
      : await _ns.refresh();
    if (out && out.ok !== false) {
      const all = await _ns.loadAll();
      runKeywordWatchlistFromNews(all);
    }
    return out;
  });

  safeHandle("ithome:fetch-day", async (_evt: any, dateKey: any) =>
    _ns.fetchDay(dateKey),
  );

  safeHandle("ithome:fetch-article-body", async (_evt: any, payload: any) =>
    fetchAndAttachBody({ id: payload && payload.id }),
  );

  safeHandle("ithome:summarize-article", async (_evt: any, payload: any) =>
    summarizeArticle(payload || {}),
  );

  safeHandle("ithome:toggle-favorite", async (_evt: any, payload: any) => {
    const id = payload && payload.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return _ns.toggleFavorite(id);
  });

  safeHandle("ithome:mark-read", async (_evt: any, id: any) => {
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return _ns.markArticleRead(id);
  });
}

module.exports = { registerIthomeHandlers };
