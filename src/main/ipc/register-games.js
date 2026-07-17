/**
 * src/main/ipc/register-games.js
 *
 * 游戏优惠聚合 — IPC 注册。
 *   games:getDeals → 聚合各平台折扣 / 喜+1 / 热门榜 (src/main/games/aggregator.js)
 *
 * 2026-07-16 新增。主机平台 (Xbox/PS/Switch) 如需真实数据，可配置 IsThereAnyDeal
 * 免费 key：通过 payload.itadKey 传入，或读取环境变量 ITAD_API_KEY。
 */

const { getGameDeals } = require("../games/aggregator");

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

function resolveItadKey(payload) {
  if (payload && typeof payload.itadKey === "string" && payload.itadKey.trim()) {
    return payload.itadKey.trim();
  }
  return process.env.ITAD_API_KEY || null;
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
      const allowedModes = ["deals", "free", "top"];
      const allowedSorts = ["savings", "price", "rating"];
      const platform = allowedPlatforms.includes(opts.platform)
        ? opts.platform
        : "all";
      const mode = allowedModes.includes(opts.mode) ? opts.mode : "deals";
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
        dealsCacheSet(cacheKey, result); // 仅缓存成功结果
        return result;
      } catch (err) {
        return {
          ok: false,
          reason: "aggregate_failed",
          error: err && err.message,
          items: [],
          sources: {},
          count: 0,
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
}

module.exports = { registerGamesHandlers };
