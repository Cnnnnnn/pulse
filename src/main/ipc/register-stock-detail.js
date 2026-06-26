/**
 * src/main/ipc/register-stock-detail.js
 *
 * 阶段四: 个股 AI 分析 IPC handler.
 * 60s 内存缓存 (数据) + 走 aiStockDetailAnalyze (24h 持久化).
 *
 * ponytail: 与 register-stocks.js 风格一致 — safeHandle + threwResponse 模式.
 */
const { createStockHttpClient } = require("../chromium-http-client");
const { fetchStockDetailAngles } = require("../../stocks/stock-detail-fetcher");
const { computeStockCacheKey } = require("../../stocks/stock-detail-cache");
const { aiStockDetailAnalyze } = require("../../ai/stock-detail-advisor");

const CACHE_TTL_MS = 60_000;
const _detailCache = new Map();

function registerStockDetailHandlers(ctx) {
  const { safeHandle, threwResponse } = ctx;

  safeHandle(
    "stocks:detail-angles",
    async (_event, { code, angles } = {}) => {
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
    { onError: (err) => threwResponse(err, { perAngle: {} }) },
  );

  safeHandle(
    "stocks:detail-analyze",
    async (_event, { code, angles, perAngleData, freeText } = {}) => {
      return await aiStockDetailAnalyze({ code, angles, perAngleData, freeText });
    },
    {
      onError: (err) => ({
        ok: false,
        reason: "internal_error",
        error: err && err.message,
      }),
    },
  );
}

module.exports = { registerStockDetailHandlers };