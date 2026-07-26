/**
 * src/utils/http-constants.ts
 *
 * 跨模块共享的 HTTP 常量单一来源.
 *
 * 2026-07-26: 抽出 BROWSER_UA / BROWSER_UA_SAFARI / SINA_REFERER.
 *   - 之前散落在 src/main/games/normalize.ts (canonical), src/main/chromium-http-client.ts,
 *     src/main/wechat-hot/fetcher.ts, src/funds/fund-fetcher-sina.ts, src/stocks/sina-fetcher.ts,
 *     src/metals/metal-sina-hf-fetcher.ts 多份复制 (Chrome 版本号已漂移 120 vs 124).
 *   - games/normalize.ts 通过 re-export 保持向后兼容 (game fetcher 已有 import 不破坏).
 *
 * Phase 7: export-only（renderer 共享 / main / workers 都可用，禁止 module.exports）.
 */

/** macOS Safari UA (跟 WebKit 真实 push2 接口对齐, 引用 Chromium UA 会被某些接口限流). */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Safari 原生 UA (用于模拟 macOS Safari 浏览器, 部分 apple 域名要求). */
export const BROWSER_UA_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Sina 系接口要求 Referer 才不返 403 (funds / stocks / metals 共用). */
export const SINA_REFERER = "https://finance.sina.com.cn";

/** 东方财富行情接口 Referer (push2 / push2his / push2delay 共用). */
export const EM_REFERER = "https://quote.eastmoney.com/";

/**
 * Eastmoney 行情接口通用 headers (UA + EM Referer).
 * 用于 metals / stocks 等 push2 系接口. ponytail: UA 是 truncated 版, 不是完整
 * Chrome UA — 部分 EM 接口对完整 UA 限流, truncated 反而稳定.
 */
export const EM_DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: EM_REFERER,
};
