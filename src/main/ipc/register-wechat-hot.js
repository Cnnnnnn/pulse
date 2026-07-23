/**
 * src/main/ipc/register-wechat-hot.js
 *
 * 唯一 electron 边界. 通过 ctx.safeHandle 注册 2 个 channel:
 *   wechat-hot:load     返 cache (不触网)
 *   wechat-hot:refresh  触发 fetch + 推 wechat-hot:updated
 */

const { fetchWechatHot } = require("../wechat-hot/fetcher.js");
const { createWechatHotCache } = require("../wechat-hot/cache.js");
const { loadReadIds, markItemRead } = require("../wechat-hot/read-store.js");
const { HttpClient } = require("../http-client.ts");
const { mainLog } = require("../log.ts");

const UPDATED_CHANNEL = "wechat-hot:updated";
const TIMEOUT_MS = 10000;

function registerWechatHotHandlers(ctx) {
  const { safeHandle, sendToRenderer, getConfig } = ctx;
  if (typeof safeHandle !== "function") return;

  function runKeywordWatchlist(items) {
    try {
      const {
        checkWatchlistKeywordUpdates,
        makeWatchlistSendNotification,
      } = require("../watchlist");
      checkWatchlistKeywordUpdates({
        headlines: items || [],
        sendNotification: makeWatchlistSendNotification(getConfig),
      });
    } catch (err) {
      mainLog.warn(
        `[wechat-hot] watchlist keyword check failed: ${err && err.message}`,
      );
    }
  }

  // 单例 HttpClient — 单次 GET 拉取, 跟 metal-ipc.js 同模式
  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const cache = createWechatHotCache({
    fetcher: () => fetchWechatHot({ httpClient, timeoutMs: TIMEOUT_MS }),
    onUpdate: (payload) => {
      if (typeof sendToRenderer === "function") {
        try { sendToRenderer(UPDATED_CHANNEL, payload); } catch { /* noop */ }
      }
      runKeywordWatchlist(payload && payload.items);
    },
  });

  safeHandle("wechat-hot:load", async () => cache.load());

  safeHandle("wechat-hot:refresh", async () => {
    try {
      return await cache.refresh();
    } catch (err) {
      mainLog.warn(`[ipc] wechat-hot:refresh failed: reason=${err && err.reason}, msg=${err && err.message}`);
      return { ok: false, reason: err && err.reason ? err.reason : "threw" };
    }
  });

  // I6 v2: 已读词持久化 (仿 ithome:mark-read)
  safeHandle("wechat-hot:load-read", () => loadReadIds());

  safeHandle("wechat-hot:mark-read", (_evt, title) => {
    if (!title || typeof title !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return markItemRead(title);
  });
}

module.exports = { registerWechatHotHandlers, UPDATED_CHANNEL };
