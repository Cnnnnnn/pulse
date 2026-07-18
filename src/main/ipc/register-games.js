/**
 * src/main/ipc/register-games.js
 *
 * 游戏优惠聚合 — IPC 注册。
 *   games:getDeals → 聚合各平台折扣 / 免费活动 (src/main/games/aggregator.js)
 *
 * 2026-07-16 新增。主机平台 (Xbox/PS/Switch) 如需真实数据，可配置 IsThereAnyDeal
 * 免费 key：通过 payload.itadKey 传入，或读取环境变量 ITAD_API_KEY。
 */

const { getGameDeals } = require("../games/aggregator");
const { exchangeRateService, isValidCurrency } = require("../games/exchange-rates");
const { fetchJson } = require("../games/normalize");

const EMPTY_FX = { rates: {}, date: null, fetchedAt: null, stale: true };

// games:getDeals 接受的 mode 白名单（Task 2 清理：删除已废弃的 'top'，
// TopRanking.jsx 已无引用）。提升为模块级常量便于测试与跨文件复用。
// Task 3 新增 'compare'：比价视图（跨平台同款价格对比）。
const ALLOWED_MODES = ["deals", "free", "compare"];

// ── 请求级缓存（Map + TTL，照搬 register-stocks.js 范式）──────────────
// 按 (platform, mode, sort, minSavings) 维度缓存聚合结果，切 Tab 来回切时
// 5 分钟内命中缓存，避免重复打 5+ 个外部 API（CheapShark 有 rate limit）。
const DEALS_CACHE_TTL_MS = 5 * 60_000; // 5 分钟
const DEALS_CACHE_MAX = 64; // (platform×mode×sort×minSavings) 组合有限，64 足够
/** @type {Map<string, {result:object, fetchedAt:number}>} */
const _dealsCache = new Map();

function dealsCacheKey({ platform, mode, sort, minSavings }) {
  // sort 必须进 key：games 的 sort 在 main 侧 aggregator 做，不进 key 会串味
  // country/itadKey 不进 key：聚合内只影响主机平台且基本恒定
  return JSON.stringify({ platform, mode, sort, minSavings });
}

function dealsCacheGet(key) {
  const e = _dealsCache.get(key);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > DEALS_CACHE_TTL_MS) {
    _dealsCache.delete(key);
    return null;
  }
  return e.result;
}

function dealsCacheSet(key, result) {
  // 超限清一半（简易 LRU，与 register-stocks.js searchCacheSet 一致）
  if (_dealsCache.size > DEALS_CACHE_MAX) {
    const drop = [..._dealsCache.keys()].slice(0, DEALS_CACHE_MAX >> 1);
    for (const k of drop) _dealsCache.delete(k);
  }
  _dealsCache.set(key, { result, fetchedAt: Date.now() });
}

function resetDealsCache() {
  _dealsCache.clear();
}

function resolveItadKey(payload) {
  if (payload && typeof payload.itadKey === "string" && payload.itadKey.trim()) {
    return payload.itadKey.trim();
  }
  return process.env.ITAD_API_KEY || null;
}

function extractFxCurrencies(items) {
  const set = new Set();
  for (const item of items || []) {
    const cur = item && item.currency;
    if (typeof cur !== "string") continue;
    const normalized = cur.trim().toUpperCase();
    if (isValidCurrency(normalized)) set.add(normalized);
  }
  return [...set];
}

async function attachFx(result, service = exchangeRateService) {
  if (!result || result.ok === false) {
    return { ...result, fx: EMPTY_FX };
  }
  try {
    const fx = await service.getRates(extractFxCurrencies(result.items));
    return { ...result, fx };
  } catch {
    return { ...result, fx: EMPTY_FX };
  }
}

/** 从 cheapshark /games?steamAppID= 响应提取历史最低价。 */
function extractLowestFromCheapshark(games) {
  if (!Array.isArray(games) || games.length === 0) return null;
  let min = Infinity;
  for (const g of games) {
    const price = Number(g && g.cheapest);
    if (Number.isFinite(price) && price < min) min = price;
  }
  return Number.isFinite(min) ? min : null;
}

function registerGamesHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle(
    "games:getDeals",
    async (_event, payload) => {
      const opts =
        payload && typeof payload === "object" ? payload : {};
      const allowedPlatforms = [
        "all",
        "steam",
        "epic",
        "xbox",
        "playstation",
        "switch",
      ];
      const allowedSorts = ["savings", "price", "rating"];
      const platform = allowedPlatforms.includes(opts.platform)
        ? opts.platform
        : "all";
      const mode = ALLOWED_MODES.includes(opts.mode) ? opts.mode : "deals";
      const sort = allowedSorts.includes(opts.sort) ? opts.sort : "savings";
      const minSavings =
        Number(opts.minSavings) > 0 && Number(opts.minSavings) <= 100
          ? Math.round(Number(opts.minSavings))
          : 0;

      // 命中缓存直接返回（附 fromCache 标记，renderer 可显示"N 分钟前"）
      const cacheKey = dealsCacheKey({ platform, mode, sort, minSavings });
      const cached = dealsCacheGet(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true };
      }

      try {
        const result = await getGameDeals({
          platform,
          mode,
          sort,
          minSavings,
          country: opts.country || "CN",
          itadKey: resolveItadKey(opts),
        });
        const withFx = await attachFx(result);
        dealsCacheSet(cacheKey, withFx);
        return withFx;
      } catch (err) {
        return {
          ok: false,
          reason: "aggregate_failed",
          error: err && err.message,
          items: [],
          sources: {},
          count: 0,
          fx: EMPTY_FX,
        };
      }
    },
    {
      logMeta: (_evt, payload) => ({
        platform: payload && payload.platform,
        mode: payload && payload.mode,
      }),
    },
  );

  safeHandle(
    "games:getSteamLowest",
    async (_event, payload) => {
      const appId = payload && payload.steamAppId;
      if (!appId) return { lowestPrice: null };
      try {
        const url = `https://www.cheapshark.com/api/1.0/games?steamAppID=${encodeURIComponent(appId)}`;
        const data = await fetchJson(url, { timeoutMs: 9000 });
        return { lowestPrice: extractLowestFromCheapshark(data) };
      } catch (err) {
        return { lowestPrice: null };
      }
    },
  );

  safeHandle(
    "games:getItadLowest",
    async (_event, payload) => {
      const slugs = Array.isArray(payload && payload.slugs) ? payload.slugs : [];
      const key = (payload && payload.itadKey) || process.env.ITAD_API_KEY || null;
      const { fetchItadLowest } = require("../games/itad");
      const lowestMap = await fetchItadLowest(slugs, { key });
      return { lowestMap };
    },
  );
}

module.exports = {
  registerGamesHandlers,
  attachFx,
  extractLowestFromCheapshark,
  EMPTY_FX,
  dealsCacheKey,
  dealsCacheGet,
  dealsCacheSet,
  DEALS_CACHE_TTL_MS,
  DEALS_CACHE_MAX,
  resetDealsCache,
  ALLOWED_MODES,
};
