/**
 * src/main/ipc/register-stocks.js
 *
 * 股票筛选器 3 个 IPC handler (screen / search / ai-advise). 对照 register-funds.js.
 * 内置 60s TTL 内存缓存 (避免短时连点重复打东财接口).
 *
 * ponytail: 走 createStockHttpClient — 在 Electron 环境自动用 Chromium net.fetch
 * (绕开 Node OpenSSL 在 push2.eastmoney.com 被 RST 的反爬). vitest 环境 fallback 到 HttpClient.
 */
const { createStockHttpClient } = require("../chromium-http-client");
const { fetchStocks } = require("../../stocks/stock-fetcher");
const { searchStocks } = require("../../stocks/stock-search");
const { applyScreen } = require("../../stocks/stock-filter");
const { computeMarketOverview } = require("../../stocks/market-overview");
const { aiStockAdvise } = require("../../ai/stock-screener-advisor");

const CACHE_TTL_MS = 60_000;
// 内存缓存: { key, rows, total, fetchedAt }. key = criteria+sort 的 JSON.
let _cache = null;

// ponytail: 搜索结果也加缓存 — 用户连续输入 "贵州茅台" / "贵州" 每次微调都打接口没意义.
// TTL 5min, key = query (trim+lowercase). 命中即返, 不再调 searchStocks.
const SEARCH_CACHE_TTL_MS = 5 * 60_000;
/** @type {Map<string, {results: any[], fetchedAt: number}>} */
const _searchCache = new Map();

function searchCacheGet(query) {
  const e = _searchCache.get(query);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > SEARCH_CACHE_TTL_MS) {
    _searchCache.delete(query);
    return null;
  }
  return e.results;
}

function searchCacheSet(query, results) {
  // ponytail: 缓存上限 200 条, 防内存泄漏. LRU 简化版 — 超限清一半.
  if (_searchCache.size > 200) {
    const drop = [..._searchCache.keys()].slice(0, 100);
    for (const k of drop) _searchCache.delete(k);
  }
  _searchCache.set(query, { results, fetchedAt: Date.now() });
}

// ponytail: 东财底层错误 token ('network' / 'timeout' / 'HTTP 5xx') 不能直接漏给 UI.
// 翻译成人类可读 + 提示重试 + 原因提示 (公司网络/代理常见 ECONNRESET).
function friendlyFetchError(raw) {
  if (!raw) return "未知错误, 请重试";
  const r = String(raw).toLowerCase();
  if (r === "network")
    return "无法连接行情服务器 (可能被公司网络/代理拦截), 请检查网络后重试";
  if (r === "timeout") return "行情接口超时, 请稍后重试";
  if (r.startsWith("http "))
    return `行情接口返回 ${raw.replace(/^HTTP\s+/i, "")}, 请稍后重试`;
  if (r.includes("econn") || r.includes("enotfound") || r.includes("eai"))
    return "无法连接行情服务器, 请检查网络";
  return `${raw} (请稍后重试)`;
}

function criteriaKey(criteria, sort) {
  return JSON.stringify({ c: criteria || {}, s: sort || null });
}

function registerStocksHandlers(ctx) {
  const { safeHandle, threwResponse } = ctx;

  safeHandle(
    "stocks:screen",
    async (_event, { criteria, sort } = {}) => {
      const key = criteriaKey(criteria, sort);
      const now = Date.now();
      if (
        _cache &&
        _cache.key === key &&
        now - _cache.fetchedAt < CACHE_TTL_MS
      ) {
        return {
          ok: true,
          results: applyScreen(_cache.rows, criteria, sort),
          total: _cache.total,
          fetchedAt: _cache.fetchedAt,
          fromCache: true,
        };
      }
      const httpClient = createStockHttpClient({
        timeout: 10000,
        maxRetries: 1,
      });
      // 把排序意图下推给东财 (fid), 让东财先按该维度排好, 翻页拉全量后前端再二次过滤.
      const sortKey = sort && sort.key;
      const out = await fetchStocks(httpClient, { sortKey });
      if (out.error) {
        return {
          ok: false,
          reason: "fetch_failed",
          error: friendlyFetchError(out.error),
        };
      }
      _cache = {
        key,
        rows: out.rows,
        total: out.total,
        fetchedAt: out.fetchedAt,
      };
      return {
        ok: true,
        results: applyScreen(out.rows, criteria, sort),
        total: out.total,
        fetchedAt: out.fetchedAt,
        fromCache: false,
      };
    },
    { onError: (err) => threwResponse(err, { results: [], total: 0 }) },
  );

  safeHandle(
    "stocks:search",
    async (_event, query) => {
      const q = String(query || "")
        .trim()
        .toLowerCase();
      if (!q) return { ok: true, results: [] };
      // ponytail: 同样的 query 5min 内直接返缓存, 避免 250ms debounce 触发后重复打 searchapi.
      const cached = searchCacheGet(q);
      if (cached) return { ok: true, results: cached, fromCache: true };
      const httpClient = createStockHttpClient({
        timeout: 6000,
        maxRetries: 0,
      });
      const results = await searchStocks(q, httpClient);
      searchCacheSet(q, results);
      return { ok: true, results };
    },
    { onError: (err) => threwResponse(err, { results: [] }) },
  );

  // 阶段二: AI 推荐筛选策略 — 走 chatCompletion (复用 P71 预算 + safeStorage key).
  // marketOverview 从最近一次 fetchStocks 缓存的全市场 rows 计算; 用户首次未拉取时降级为 null.
  safeHandle(
    "stocks:ai-advise",
    async (_event, payload = {}) => {
      const intentChip = payload && payload.intentChip;
      const freeText = payload && payload.freeText;
      if (!intentChip || !intentChip.id) {
        return { ok: false, reason: "invalid_args" };
      }
      // ponytail: marketOverview 派生自 _cache.rows, 避免额外打接口. _cache 是 stock:screen 内存缓存.
      const overviewRows = _cache && _cache.rows ? _cache.rows : [];
      const marketOverview = computeMarketOverview(overviewRows);
      const result = await aiStockAdvise({
        intentChip,
        freeText,
        marketOverview,
        currentCriteria: payload && payload.currentCriteria,
        statePath: payload && payload.statePath,
      });
      return result;
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

module.exports = { registerStocksHandlers };
