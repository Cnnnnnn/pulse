/**
 * AI 榜单数据源失败日志。
 *
 * 各数据源已经在 fetcher 内部隔离失败；这里仅提供统一的可观测性，
 * 不改变调用方的控制流。
 */
"use strict";

export function logFetchError(source: string, err: any): void {
  const msg = err && err.message ? err.message : String(err);
  console.warn(`[ai-leaderboard] fetch failed: ${source} — ${msg}`);
}

module.exports = { logFetchError };
