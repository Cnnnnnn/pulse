/**
 * src/main/ai-leaderboard/aggregator.js
 *
 * 聚合入口 getLeaderboard(opts)：分派 fetcher → 磁盘缓存 → 合并 → 兜底链 → 排名 → 返回 BoardResult。
 *
 * 兜底链语义（单源失败不影响其它源，全失败回退 sample）：
 *   Arena(某 board) 失败 → GitHub raw Arena → 该 board 留空
 *   AA 失败           → GitHub raw AA     → aa 维度标 'none'
 *   Arena + AA 全失败 → OpenRouter 目录    → 仅骨架（无分数）
 *   全失败            → sample.json        → source:'sample' 徽标
 *
 * 保证始终返回 { ok:true, ... BoardResult }（最坏 = sample）。
 */

const { CATEGORY_META, DIMENSION_META, SOURCE, ATTRIBUTION } = require("./types");
const { mergeModelSlices } = require("./normalize");
const arenaFetcher = require("./fetcher-arena");
const aaFetcher = require("./fetcher-aa");
const openrouterFetcher = require("./fetcher-openrouter");
const { getSampleModels } = require("./sample");
const { sortModels, filterByVendor, filterBySearch } = require("./ranking");
const { cacheKey, readCache, writeCache, isStale } = require("./cache");
const { acquire } = require("./rate-limiter");
const { logFetchError } = require("../games/log");

const ARENA_TTL = 24 * 60 * 60 * 1000;
const AA_TTL = 24 * 60 * 60 * 1000;
const OR_TTL = 6 * 60 * 60 * 1000;

function _today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 取某源原始 payload（带磁盘缓存 + 过期 stale 回退）。
 * @returns {{raw:object|null, stale:boolean, fromCache:boolean}}
 */
async function getBoardRaw(fetcher, cacheSource, cacheBoard, ttl, force) {
  const key = cacheKey(cacheSource, cacheBoard, _today());
  if (!force) {
    const c = readCache(key);
    if (c && !isStale(c.fetchedAt, ttl)) {
      return { raw: c.data, stale: false, fromCache: true };
    }
    if (c) {
      // 过期但存在：先作为 stale 回退候选
      var staleRaw = c.data;
    }
  }
  let res;
  try {
    res = await fetcher.fetch({});
  } catch (err) {
    logFetchError(`agg:${cacheSource}`, err);
    res = { ok: false, data: null };
  }
  if (res && res.ok && res.data) {
    writeCache(key, res.data);
    return { raw: res.data, stale: false, fromCache: false };
  }
  // 实时失败：优先用过期缓存（stale），否则 null
  if (typeof staleRaw !== "undefined") {
    return { raw: staleRaw, stale: true, fromCache: true };
  }
  const c2 = readCache(key);
  if (c2) return { raw: c2.data, stale: true, fromCache: true };
  return { raw: null, stale: false, fromCache: false };
}

/** 模型是否与所选 category 匹配（按 board 存在性或 category 字段）。 */
function matchesCategory(item, category) {
  const board = (CATEGORY_META[category] && CATEGORY_META[category].board) || "text";
  if (item.arena && item.arena[board]) return true;
  if (item.category === category) return true;
  return false;
}

/**
 * 聚合入口。
 * @param {object} [opts]
 * @param {string} [opts.category]  'llm'|'multimodal'|'code'|'image'|'video'（默认 llm）
 * @param {string} [opts.dimension] 维度（默认 elo）
 * @param {string} [opts.vendor]    VENDOR_META 键 或 'all'（默认 all）
 * @param {"asc"|"desc"} [opts.sortDir] 默认 desc
 * @param {string} [opts.search]    本地搜索词（默认 ''）
 * @param {boolean} [opts.force]    绕过磁盘缓存（默认 false）
 * @returns {Promise<object>} BoardResult
 */
async function getLeaderboard(opts = {}) {
  const category = CATEGORY_META[opts.category] ? opts.category : "llm";
  const dimension = DIMENSION_META[opts.dimension] ? opts.dimension : "elo";
  const vendor = opts.vendor && opts.vendor !== "all" ? opts.vendor : "all";
  const sortDir = opts.sortDir === "asc" ? "asc" : "desc";
  const search = opts.search || "";
  const force = Boolean(opts.force);

  // 限流：AA 无令牌则跳过（走缓存/快照/兜底）
  let aaForce = force;
  if (!acquire("artificial-analysis")) {
    aaForce = false; // 令牌耗尽：本 tick 不真正打 AA，仅用缓存
  }

  const [arenaWrap, aaWrap, orWrap] = await Promise.all([
    getBoardRaw(arenaFetcher, "arena", "all", ARENA_TTL, force),
    getBoardRaw(aaFetcher, "artificial-analysis", "llms", AA_TTL, aaForce),
    getBoardRaw(openrouterFetcher, "openrouter", "models", OR_TTL, force),
  ]);

  const arenaModels = arenaWrap.raw ? arenaFetcher.normalize(arenaWrap.raw) : [];
  const aaModels = aaWrap.raw ? aaFetcher.normalize(aaWrap.raw) : [];
  const orModels = orWrap.raw ? openrouterFetcher.normalize(orWrap.raw) : [];

  const arenaSource = arenaModels.length ? SOURCE.LIVE : SOURCE.NONE;
  const aaSource = aaModels.length ? SOURCE.LIVE : SOURCE.NONE;

  let items;
  let sources;
  if (arenaModels.length === 0 && aaModels.length === 0) {
    // 主源全失败 → 兜底链 L1/L2
    if (orModels.length > 0) {
      items = orModels;
      sources = {
        arena: SOURCE.NONE,
        aa: SOURCE.NONE,
        openrouter: SOURCE.LIVE,
      };
    } else {
      items = getSampleModels();
      sources = {
        arena: SOURCE.SAMPLE,
        aa: SOURCE.SAMPLE,
        openrouter: SOURCE.SAMPLE,
      };
    }
  } else {
    items = mergeModelSlices([arenaModels, aaModels, orModels]);
    sources = {
      arena: arenaSource,
      aa: aaSource,
      openrouter: orModels.length ? SOURCE.LIVE : SOURCE.NONE,
    };
  }

  // 分类筛选 → 排序 → vendor 筛选 → 搜索
  let shown = items.filter((it) => matchesCategory(it, category));
  shown = sortModels(shown, dimension, sortDir, category);
  shown = filterByVendor(shown, vendor);
  shown = filterBySearch(shown, search);

  // 是否整页 sample（决定页头「示例」徽标）
  const isSample =
    dimension === "elo"
      ? sources.arena === SOURCE.SAMPLE
      : sources.aa === SOURCE.SAMPLE;

  // 署名清单（AA 强制；sample 态显式说明）
  const attribution = [];
  if (sources.arena === SOURCE.LIVE) attribution.push(ATTRIBUTION["arena-snapshot"]);
  if (sources.aa === SOURCE.LIVE) attribution.push(ATTRIBUTION["artificial-analysis"]);
  if (sources.openrouter === SOURCE.LIVE) attribution.push(ATTRIBUTION["openrouter"]);
  if (sources.arena === SOURCE.SAMPLE || sources.aa === SOURCE.SAMPLE) {
    attribution.push(ATTRIBUTION["sample"]);
  }

  return {
    ok: true,
    category,
    dimension,
    vendor,
    items: shown,
    sources,
    attribution,
    count: shown.length,
    stale: arenaWrap.stale || aaWrap.stale || orWrap.stale,
    fromCache: arenaWrap.fromCache && aaWrap.fromCache && orWrap.fromCache,
    isSample,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getLeaderboard, matchesCategory };
