/**
 * src/main/ipc/register-wechat-hot.js
 *
 * 唯一 electron 边界. 通过 ctx.safeHandle 注册 2 个 channel:
 *   wechat-hot:load     返 cache (不触网)
 *   wechat-hot:refresh  触发 fetch + 推 wechat-hot:updated
 */


// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";
import type { IpcChannelMap, WechatHotPayload } from "../../shared/ipc-contracts";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { fetchWechatHot } from "../wechat-hot/fetcher";
import { createWechatHotCache } from "../wechat-hot/cache";
import { loadReadIds, markItemRead } from "../wechat-hot/read-store";
import { HttpClient } from "../http-client";
import { mainLog } from "../log";

export const UPDATED_CHANNEL = "wechat-hot:updated";
const TIMEOUT_MS = 10000;

export function registerWechatHotHandlers(ctx: any) {
  const { safeHandle, sendToRenderer, getConfig } = ctx;
  if (typeof safeHandle !== "function") return;

  function runKeywordWatchlist(items: WechatHotPayload["items"]) {
    try {
      const {
        checkWatchlistKeywordUpdates,
        makeWatchlistSendNotification,
      } = require("../watchlist.ts");
      checkWatchlistKeywordUpdates({
        headlines: items || [],
        sendNotification: makeWatchlistSendNotification(getConfig),
      });
    } catch (err: any) {
      mainLog.warn(
        `[wechat-hot] watchlist keyword check failed: ${errMsg(err)}`,
      );
    }
  }

  // 单例 HttpClient — 单次 GET 拉取, 跟 metal-ipc.js 同模式
  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const cache = createWechatHotCache({
    fetcher: () => fetchWechatHot({ httpClient, timeoutMs: TIMEOUT_MS }),
    onUpdate: (payload: IpcChannelMap["wechat-hot:load"]["result"]) => {
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
    } catch (err: any) {
      const reason = err && typeof err === "object" && "reason" in err ? (err as any).reason : null;
      mainLog.warn(`[ipc] wechat-hot:refresh failed: reason=${reason}, msg=${errMsg(err)}`);
      return { ok: false, reason: reason || "threw" };
    }
  });

  // I6 v2: 已读词持久化 (仿 ithome:mark-read)
  safeHandle("wechat-hot:load-read", () => loadReadIds());

  safeHandle(
    "wechat-hot:mark-read",
    (
      _evt: unknown,
      title: IpcChannelMap["wechat-hot:mark-read"]["args"][0],
    ) => {
    if (!title || typeof title !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return markItemRead(title);
    },
  );
}

module.exports = { registerWechatHotHandlers, UPDATED_CHANNEL };
