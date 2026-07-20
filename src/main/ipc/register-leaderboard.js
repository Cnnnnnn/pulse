/**
 * src/main/ipc/register-leaderboard.js
 *
 * AI 榜单 — IPC 注册。
 *   leaderboard:get      → 聚合 (命中请求级缓存则直接返回)
 *   leaderboard:refresh  → 强制重拉 (force:true)，清缓存后回写
 *
 * 渲染层只通过这两个通道交互（白名单）。请求级缓存 (Map + TTL 5min)
 * 照搬 games 同款范式，避免重复打外部 API（Arena/AA 有 rate limit）。
 */

const { getLeaderboard } = require("../ai-leaderboard");
const { CATEGORY_META, DIMENSION_META, VENDOR_META } = require("../ai-leaderboard/types");

// ── 请求级缓存（Map + TTL，与 register-games.js 同构）──────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const CACHE_MAX = 32;
/** @type {Map<string, {result:object, fetchedAt:number}>} */
const _cache = new Map();

/**
 * 缓存键：仅含影响数据内容的维度（category/dimension/vendor/sortDir/search）。
 * force 不进 key —— 刷新走「跳过读取 + 回写」语义。
 * @param {object} opts
 * @returns {string}
 */
function boardCacheKey(opts) {
  return JSON.stringify({
    category: opts.category,
    dimension: opts.dimension,
    vendor: opts.vendor,
    sortDir: opts.sortDir,
    search: opts.search || "",
  });
}

function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return e.result;
}

function cacheSet(key, result) {
  if (_cache.size > CACHE_MAX) {
    const drop = [..._cache.keys()].slice(0, CACHE_MAX >> 1);
    for (const k of drop) _cache.delete(k);
  }
  _cache.set(key, { result, fetchedAt: Date.now() });
}

/** 测试 / 手动刷新用：清请求级缓存。 */
function resetLeaderboardCache() {
  _cache.clear();
}

/**
 * 白名单 sanitize：仅允许已知 category / dimension / vendor 等。
 * @param {unknown} payload
 * @returns {object}
 */
function sanitize(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const category = CATEGORY_META[p.category] ? p.category : "llm";
  const dimension = DIMENSION_META[p.dimension] ? p.dimension : "elo";
  const vendorValid =
    p.vendor && typeof p.vendor === "string" && (p.vendor === "all" || VENDOR_META[p.vendor]);
  const vendor = vendorValid ? p.vendor : "all";
  const sortDir = p.sortDir === "asc" ? "asc" : "desc";
  const search = typeof p.search === "string" ? p.search : "";
  const force = Boolean(p.force);
  return { category, dimension, vendor, sortDir, search, force };
}

function registerLeaderboardHandlers(ctx) {
  const { safeHandle } = ctx;

  async function handleGet(_event, payload) {
    const opts = sanitize(payload);
    const key = boardCacheKey(opts);

    // 非强制请求命中缓存直接返回（附 fromCache 标记）
    if (!opts.force) {
      const cached = cacheGet(key);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }

    try {
      const result = await getLeaderboard(opts);
      cacheSet(key, result);
      return opts.force ? { ...result, fromCache: false } : result;
    } catch (err) {
      return {
        ok: false,
        reason: "aggregate_failed",
        error: err && err.message,
        items: [],
        sources: { arena: "none", aa: "none", openrouter: "none" },
        attribution: [],
        count: 0,
        stale: false,
        fromCache: false,
        isSample: false,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  safeHandle("leaderboard:get", handleGet, {
    logMeta: (_evt, payload) => ({
      category: payload && payload.category,
      dimension: payload && payload.dimension,
    }),
  });

  // refresh = get + force:true；聚合内部绕过磁盘缓存重拉，回写请求级缓存。
  safeHandle("leaderboard:refresh", async (_event, payload) => {
    const opts = sanitize(payload);
    opts.force = true;
    const key = boardCacheKey(opts);
    _cache.delete(key); // 强制清旧缓存，保证下次 get 拿到新结果
    try {
      const result = await getLeaderboard(opts);
      cacheSet(key, result);
      return { ...result, fromCache: false };
    } catch (err) {
      return {
        ok: false,
        reason: "aggregate_failed",
        error: err && err.message,
        items: [],
        sources: { arena: "none", aa: "none", openrouter: "none" },
        attribution: [],
        count: 0,
        stale: false,
        fromCache: false,
        isSample: false,
        fetchedAt: new Date().toISOString(),
      };
    }
  });
}

module.exports = {
  registerLeaderboardHandlers,
  boardCacheKey,
  cacheGet,
  cacheSet,
  resetLeaderboardCache,
  sanitize,
};
