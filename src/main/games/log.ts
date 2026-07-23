/**
 * src/main/games/log.ts
 *
 * fetcher 失败日志 — 统一格式，便于 main 进程排障。
 *
 * 设计意图：单源失败已被 aggregator 的 fetchPlatform 错误隔离，
 * 这里只做可观测性（console.warn），不影响控制流。
 * 所有 fetcher 的 catch 块应在 return 兜底值前调用本函数。
 */
"use strict";

/**
 * @param source 数据源标识，如 "playstation:psgamespider"
 * @param err 异常对象
 */
export function logFetchError(source: string, err: unknown): void {
  const msg = err && (err as any).message ? (err as any).message : String(err);
  console.warn(`[games] fetch failed: ${source} — ${msg}`);
}

module.exports = { logFetchError };
