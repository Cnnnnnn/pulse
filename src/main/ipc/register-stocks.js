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
const { fetchStocks, fetchStocksByCodes } = require("../../stocks/stock-fetcher");
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

// ponytail: 2026-07-07 — 用全市场 rows (StockRow 形态) 补搜索结果的 price/changePct/industry.
// entries: searchStocks raw 结果. rows: _cache.rows 或 null. 返新数组, 不改 input.
function enrichSearchResults(entries, rows) {
  if (!Array.isArray(entries) || !Array.isArray(rows) || rows.length === 0) {
    return entries;
  }
  // 构建 code→row 索引一次. ~5500 entries, 单次 O(N) build + O(M) lookup.
  const byCode = new Map();
  for (const r of rows) {
    if (r && r.code) byCode.set(r.code, r);
  }
  return entries.map((e) => {
    if (!e || !e.code) return e;
    const r = byCode.get(e.code);
    if (!r) return e;
    return {
      ...e,
      price: r.price != null ? r.price : null,
      changePct: r.changePct != null ? r.changePct : null,
      industry: r.industry || e.industry || null,
    };
  });
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
      // 但缓存里的 entry 是历史 enrich 后的快照, 当时 _cache.rows 缺 + fetchStocksByCodes 失败
      // 的话, price/changePct 仍是 null. 现在 _cache.rows 有了, 重跑一次 enrich 补上价再返,
      // 不再调 searchStocks (省接口).
      const cached = searchCacheGet(q);
      if (cached) {
        const stillMissing = cached.filter(
          (e) => e && e.code && (e.price == null || e.changePct == null),
        );
        if (stillMissing.length === 0) {
          return { ok: true, results: cached, fromCache: true };
        }
        // ponytail 2026-07-07: 缓存命中但有缺价 entry → 走两层 fallback 补上, 写回缓存.
        const httpClient = createStockHttpClient({
          timeout: 6000,
          maxRetries: 0,
        });
        let reEnriched = enrichSearchResults(cached, _cache && _cache.rows);
        const reMissing = reEnriched.filter(
          (e) => e && e.code && (e.price == null || e.changePct == null),
        );
        if (reMissing.length > 0) {
          try {
            const { rows } = await fetchStocksByCodes(
              reMissing.map((e) => e.code),
              httpClient,
              { timeoutMs: 6000 },
            );
            if (Array.isArray(rows) && rows.length > 0) {
              const byCode = new Map(rows.map((r) => [r.code, r]));
              reEnriched = reEnriched.map((e) => {
                if (!e || !e.code) return e;
                const r = byCode.get(e.code);
                if (!r) return e;
                return {
                  ...e,
                  price:
                    e.price != null
                      ? e.price
                      : r.price != null
                        ? r.price
                        : null,
                  changePct:
                    e.changePct != null
                      ? e.changePct
                      : r.changePct != null
                        ? r.changePct
                        : null,
                  industry: e.industry || r.industry || null,
                };
              });
            }
          } catch (_) {
            // ponytail: 行情拉失败保持原缓存, 不阻塞返结果
          }
        }
        searchCacheSet(q, reEnriched);
        return { ok: true, results: reEnriched, fromCache: true };
      }
      const httpClient = createStockHttpClient({
        timeout: 6000,
        maxRetries: 0,
      });
      const results = await searchStocks(q, httpClient);
      // ponytail 2026-07-07: 搜索建议接口不带实时价/行业. 两层 fallback 补 3 个字段:
      //   1) _cache.rows (上次 stocks:screen 全市场结果) — O(1) 反查, 命中率高
      //   2) _cache.rows 缺 (首次启动还没拉过筛选, 或该 code 被全市场筛掉) →
      //      走 fetchStocksByCodes 一次性按 secid 列表拉 push2 ulist.np, 让从搜索
      //      直接进诊断 + 加对比池的也能拿到现价/涨跌. 失败静默退化为原 results.
      let enriched = enrichSearchResults(results, _cache && _cache.rows);
      const stillMissing = enriched.filter(
        (e) => e && e.code && (e.price == null || e.changePct == null),
      );
      if (stillMissing.length > 0) {
        try {
          const { rows } = await fetchStocksByCodes(
            stillMissing.map((e) => e.code),
            httpClient,
            { timeoutMs: 6000 },
          );
          if (Array.isArray(rows) && rows.length > 0) {
            const byCode = new Map(rows.map((r) => [r.code, r]));
            enriched = enriched.map((e) => {
              if (!e || !e.code) return e;
              const r = byCode.get(e.code);
              if (!r) return e;
              return {
                ...e,
                price:
                  e.price != null ? e.price : r.price != null ? r.price : null,
                changePct:
                  e.changePct != null
                    ? e.changePct
                    : r.changePct != null
                      ? r.changePct
                      : null,
                industry: e.industry || r.industry || null,
              };
            });
          }
        } catch (_) {
          // ponytail: 行情拉失败不阻塞搜索, 仍返部分结果
        }
      }
      searchCacheSet(q, enriched);
      return { ok: true, results: enriched };
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

module.exports = { registerStocksHandlers, enrichSearchResults };
