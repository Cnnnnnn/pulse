/**
 * src/main/ipc/register-stock-detail.js
 *
 * 阶段四: 个股 AI 分析 IPC handler.
 * 60s 内存缓存 (数据) + 走 aiStockDetailAnalyze (24h 持久化).
 *
 * ponytail: 与 register-stocks.js 风格一致 — safeHandle + threwResponse 模式.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { createStockHttpClient } from "../chromium-http-client";
import { fetchStockDetailAngles, fetchSingleAngle } from "../../stocks/stock-detail-fetcher";
import { CACHE_VERSION, computeStockCacheKey } from "../../stocks/stock-detail-cache";
import { aiStockDetailAnalyze, refreshAngleLocally } from "../../ai/stock-detail-advisor";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

const CACHE_TTL_MS = 60_000;
const _detailCache = new Map();

function invalidateDetailCache(code: any) {
  const prefix = `${CACHE_VERSION}|detail|${String(code)}|`;
  for (const key of _detailCache.keys()) {
    if (key.startsWith(prefix)) _detailCache.delete(key);
  }
}

export function registerStockDetailHandlers(ctx: any) {
  const { safeHandle, threwResponse } = ctx;

  safeHandle(
    "stocks:detail-angles",
    async (
      _event: unknown,
      payload: IpcChannelMap["stocks:detail-angles"]["args"][0],
    ) => {
      const { code, angles } = payload || {};
      if (!code || !Array.isArray(angles) || angles.length === 0) {
        return { ok: false, reason: "invalid_args" };
      }
      const key = computeStockCacheKey(code, angles);
      if (!key) return { ok: false, reason: "invalid_cache_key" };
      const cached = _detailCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return { ok: true, data: cached.data, fromCache: true };
      }
      const httpClient = createStockHttpClient({ timeout: 8000, maxRetries: 1 });
      const data = await fetchStockDetailAngles(httpClient, code, angles);
      if (!data || data.fulfilledCount === 0) {
        return {
          ok: false,
          reason: "all_fetch_failed",
          perAngle: data && data.perAngle,
        };
      }
      _detailCache.set(key, { data, fetchedAt: Date.now() });
      return { ok: true, data, fromCache: false };
    },
    { onError: (err: any) => threwResponse(err, { perAngle: {} }) },
  );

  safeHandle(
    "stocks:detail-analyze",
    async (
      _event: unknown,
      payload: IpcChannelMap["stocks:detail-analyze"]["args"][0],
    ) => {
      const { code, angles, perAngleData, freeText, scores } = payload || {};
      return await aiStockDetailAnalyze({ code, angles, perAngleData, freeText, scores });
    },
    {
      onError: (err: any) => ({
        ok: false,
        reason: "internal_error",
        error: errMsg(err),
      }),
    },
  );

// ponytail: 2026-07-07 P1-2 — 单条 angle 的本地快速重解读, 不调 LLM.
// renderer 拿到 {note} 后合并进 aiResult.perAngle[key]. 缺数据返 {ok:false, reason:'no_data'}.
  safeHandle(
    "stocks:angle-refresh",
    async (
      _event: unknown,
      payload: IpcChannelMap["stocks:angle-refresh"]["args"][0],
    ) => {
      const { angleKey, perAngleData, scores, seed } = payload || {};
      if (!angleKey) return { ok: false, reason: "invalid_args" };
      const note = refreshAngleLocally({ angleKey, perAngleData, scores, seed });
      if (!note) return { ok: false, reason: "no_data" };
      return { ok: true, note, angleKey };
    },
    {
      onError: (err: any) => ({
        ok: false,
        reason: "internal_error",
        error: errMsg(err),
      }),
    },
  );

  // ponytail 2026-07-18 P0-1 polish #2: 单条 angle 数据重拉, 走 fetchSingleAngle
  //   (跟 stocks:detail-angles 同 fetcher, 但只拉一条). 用于 DataHealthPill failed → retry.
  //   之前 retry 走的是上面的 stocks:angle-refresh (LLM 重解读), 数据失败时仍
  //   no_data, pill 永远 failed. 现改走这条, 数据成功 → pill 自动 ok.
  safeHandle(
    "stocks:angle-reload",
    async (
      _event: unknown,
      payload: IpcChannelMap["stocks:angle-reload"]["args"][0],
    ) => {
      const { code, angleKey } = payload || {};
      if (!code || !angleKey) return { ok: false, reason: "invalid_args" };
      const httpClient = createStockHttpClient({ timeout: 8000, maxRetries: 1 });
      const perAngle = await fetchSingleAngle(httpClient, code, angleKey);
      if (!perAngle) return { ok: false, reason: "invalid_args" };
      if (perAngle.status !== "ok") {
        return {
          ok: false,
          reason: perAngle.reason || "fetch_failed",
          error: perAngle.error || null,
          perAngle,
        };
      }
      // 单角度成功后使该股票的整组详情缓存失效，避免离开诊断页再进入时
      // 60s 内又读回旧 angle，覆盖刚刚重拉成功的数据。
      invalidateDetailCache(code);
      return { ok: true, perAngle };
    },
    {
      onError: (err: any) => ({
        ok: false,
        reason: "internal_error",
        error: errMsg(err),
      }),
    },
  );
}

module.exports = { registerStockDetailHandlers };
