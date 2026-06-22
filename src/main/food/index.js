/**
 * src/main/food/index.js
 *
 * 主进程 food 模块入口 — 编排 amap + dianping + cache + aggregator.
 *
 * 暴露:
 *   - fetchNearbyFood({location, radius?, sortBy?, forceRefresh?}) -> {ok, list, locationLabel, cachedAt, error?}
 *   - bootstrapFood()                                             -> 启动钩子 (清单例引用)
 *
 * 单例策略: 模块级 lazy 状态 (_cache / _amap / _dianping), 首次访问才构造.
 * _amap 是 async, 因为它要先 await getAmapKey() 读 safeStorage.
 *
 * 错误流:
 *   1) string location → 先 amap.geocode(), 失败立即返回 {ok:false, error}
 *      (geocode 内部错误代码透传; no_match 重命名为 geocode_failed, 跟 caller 契约一致)
 *   2) amap.aroundSearch() 失败 → 立即返回 (不调 dianping, 省时间也减少 Dianping 流量)
 *   3) dianping.search() 失败 → 静默降级 (ratings=[], mainLog.warn), 不影响主流程
 *
 * ponytail: 不引入 EventEmitter / RxJS 之类重抽象; 主流程 30 行, 满足 spec §3.2.
 */

const { createAmapClient } = require("./amap-client");
const { createDianpingScraper } = require("./dianping-scraper");
const { mergeFoodData } = require("./food-aggregator");
const { createFoodCache } = require("./food-cache");
const { getAmapKey } = require("./food-config");
const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min
const CACHE_MAX = 100;
const HTTP_TIMEOUT_MS = 8000;

let _cache = null;
let _amap = null;
let _dianping = null;

function _getCache() {
  if (!_cache) {
    _cache = createFoodCache({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX });
  }
  return _cache;
}

async function _getAmap() {
  if (_amap) return _amap;
  const key = await getAmapKey();
  if (!key) return null;
  _amap = createAmapClient({
    key,
    http: new HttpClient({ timeout: HTTP_TIMEOUT_MS }),
  });
  return _amap;
}

function _getDianping() {
  if (!_dianping) {
    _dianping = createDianpingScraper({
      http: new HttpClient({ timeout: HTTP_TIMEOUT_MS, maxRetries: 0 }),
    });
  }
  return _dianping;
}

// 经纬度 3 位小数 ≈ 110m 容差, 同 location 不同 device 也能命中 cache.
function _cacheKey(lat, lng, radius) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}|${radius}`;
}

/**
 * @param {{location: string|{lat:number,lng:number,label?:string}, radius?: 500|1000|2000, sortBy?: 'distance'|'rating', forceRefresh?: boolean}} opts
 * @returns {Promise<{ok:true, list:Array, locationLabel:string, cachedAt:number}|{ok:false, error:string}>}
 */
async function fetchNearbyFood(opts) {
  const radius = opts && opts.radius ? opts.radius : 1000;
  const sortBy = opts && opts.sortBy ? opts.sortBy : "distance";
  const force = !!(opts && opts.forceRefresh);

  // 1) 解析 location → {lat, lng, locationLabel}
  let lat;
  let lng;
  let locationLabel;
  if (opts && typeof opts.location === "object" && opts.location.lat != null) {
    lat = opts.location.lat;
    lng = opts.location.lng;
    locationLabel = opts.location.label || `${lat.toFixed(4)},${lng.toFixed(4)}`;
  } else if (typeof (opts && opts.location) === "string") {
    const amap = await _getAmap();
    if (!amap) return { ok: false, error: "no_key" };
    const geo = await amap.geocode(opts.location);
    if (!geo.ok) {
      return {
        ok: false,
        error: geo.error === "no_match" ? "geocode_failed" : geo.error,
      };
    }
    lat = geo.data.lat;
    lng = geo.data.lng;
    locationLabel = geo.data.label;
  } else {
    return { ok: false, error: "invalid_location" };
  }

  // 2) cache 查 (force 时跳过)
  const key = _cacheKey(lat, lng, radius);
  if (!force) {
    const cached = _getCache().get(key);
    if (cached) {
      return {
        ok: true,
        list: cached.list,
        locationLabel: cached.locationLabel,
        cachedAt: cached.cachedAt,
      };
    }
  }

  // 3) amap around-search — 失败立即返回, 不浪费 Dianping 流量
  const amap = await _getAmap();
  if (!amap) return { ok: false, error: "no_key" };
  const amapResult = await amap.aroundSearch({
    location: `${lng},${lat}`,
    radius,
    keywords: "美食",
  });
  if (!amapResult.ok) return { ok: false, error: amapResult.error };

  // 4) Dianping 并行 — 失败静默降级, 不影响主流程
  let ratings = [];
  try {
    const dpResult = await _getDianping().search({ lat, lng });
    if (dpResult.ok) ratings = dpResult.data;
    else if (mainLog && mainLog.warn) {
      mainLog.warn("[food] dianping degraded", { err: dpResult.error });
    }
  } catch (e) {
    if (mainLog && mainLog.warn) {
      mainLog.warn("[food] dianping threw", { msg: e && e.message });
    }
  }

  // 5) 合并 + 排序
  const merged = mergeFoodData(amapResult.data, ratings, {
    sortBy,
    limit: 30,
    locationLabel,
  });

  // 6) 写 cache (TTL 30min)
  const cachedAt = Date.now();
  _getCache().set(
    key,
    {
      list: merged.list,
      locationLabel: merged.locationLabel,
      cachedAt,
    },
    CACHE_TTL_MS,
  );

  return {
    ok: true,
    list: merged.list,
    locationLabel: merged.locationLabel,
    cachedAt,
  };
}

// 启动钩子: 当前 MVP 无后台预热需求, 清空单例引用.
function bootstrapFood() {
  _cache = null;
  _amap = null;
  _dianping = null;
  if (mainLog && mainLog.info) {
    mainLog.info("[food] bootstrapped (cache in-memory, no preheat)");
  }
}

module.exports = { fetchNearbyFood, bootstrapFood };
