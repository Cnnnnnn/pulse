/**
 * src/main/ipc/register-stocks.js
 *
 * 股票筛选器 6 个 IPC handler. 对照 register-funds.js.
 * 内置 60s TTL 内存缓存 (避免短时连点重复打东财接口).
 */
const { HttpClient } = require("../http-client");
const { fetchStocks } = require("../../stocks/stock-fetcher");
const { searchStocks } = require("../../stocks/stock-search");
const { applyScreen } = require("../../stocks/stock-filter");
const stockStore = require("../stock-store");

const CACHE_TTL_MS = 60_000;
// 内存缓存: { key, rows, total, fetchedAt }. key = criteria+sort 的 JSON.
let _cache = null;

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
      if (_cache && _cache.key === key && now - _cache.fetchedAt < CACHE_TTL_MS) {
        return {
          ok: true,
          results: applyScreen(_cache.rows, criteria, sort),
          total: _cache.total,
          fetchedAt: _cache.fetchedAt,
          fromCache: true,
        };
      }
      const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
      const out = await fetchStocks(httpClient);
      if (out.error) return { ok: false, reason: "fetch_failed", error: out.error };
      _cache = { key, rows: out.rows, total: out.total, fetchedAt: out.fetchedAt };
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
      const httpClient = new HttpClient({ timeout: 6000, maxRetries: 0 });
      const results = await searchStocks(query, httpClient);
      return { ok: true, results };
    },
    { onError: (err) => threwResponse(err, { results: [] }) },
  );

  safeHandle("stocks:watchlist:list", () => {
    return { ok: true, items: stockStore.loadStockWatchlist() };
  });

  safeHandle(
    "stocks:watchlist:add",
    async (_event, { code } = {}) => {
      // 反查 name/industry (用户只输代码, 名字自动填 — 跟基金 applyFundMeta 一个思路)
      const httpClient = new HttpClient({ timeout: 6000, maxRetries: 0 });
      const found = await searchStocks(String(code || ""), httpClient);
      const meta =
        found.find((x) => x.code === String(code).trim()) || {};
      const items = stockStore.addStock({
        code: String(code || "").trim(),
        name: meta.name || null,
        industry: meta.industry || null,
      });
      return { ok: true, items };
    },
    {
      logIf: (err) => !(err && err.name === "ValidationError"),
      onError: (err) => {
        if (err && err.name === "ValidationError") {
          return { ok: false, reason: "validation", error: err.message };
        }
        return threwResponse(err);
      },
    },
  );

  safeHandle("stocks:watchlist:remove", (_event, { code } = {}) => {
    const items = stockStore.removeStock(String(code || ""));
    return { ok: true, items };
  });

  // 自选股实时行情刷新 (走同一 clist, filter 出自选 code).
  safeHandle(
    "stocks:watchlist:quotes",
    async () => {
      const items = stockStore.loadStockWatchlist();
      if (items.length === 0) {
        return { ok: true, quotes: {}, fetchedAt: Date.now() };
      }
      const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
      const out = await fetchStocks(httpClient);
      if (out.error) return { ok: false, reason: "fetch_failed", error: out.error };
      const want = new Set(items.map((i) => i.code));
      const quotes = {};
      for (const row of out.rows) {
        if (want.has(row.code)) {
          quotes[row.code] = {
            price: row.price,
            changePct: row.changePct,
            pe: row.pe,
            roe: row.roe,
          };
        }
      }
      return { ok: true, quotes, fetchedAt: out.fetchedAt };
    },
    { onError: (err) => threwResponse(err, { quotes: {} }) },
  );
}

module.exports = { registerStocksHandlers };
