/**
 * src/main/ai-leaderboard/aggregator.ts
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

import { CATEGORY_META, DIMENSION_META, SOURCE, ATTRIBUTION } from "./types";
import { mergeModelSlices } from "./normalize";
import * as arenaFetcher from "./fetcher-arena";
import * as aaFetcher from "./fetcher-aa";
import * as openrouterFetcher from "./fetcher-openrouter";
import * as livebenchFetcher from "./fetcher-livebench";
import * as modelsDevFetcher from "./fetcher-models-dev";
import * as huggingfaceFetcher from "./fetcher-huggingface";
import { getSampleModels } from "./sample";
import { sortModels, filterByVendor, filterBySearch } from "./ranking";
import { cacheKey, readCache, readLatestCache, writeCache, isStale } from "./cache";
import { acquire, budget } from "./rate-limiter";
import { getPreviousArenaRanks, computeRankDelta, getArenaRankSeriesMap } from "./history";
import { logFetchError } from "./log";

const ARENA_TTL = 24 * 60 * 60 * 1000;
const AA_TTL = 24 * 60 * 60 * 1000;
// ponytail: MD 数据每日一次 (上游 commit 频率). 与 ARENA / AA 同 TTL 即可, 不需要更短刷新.
const MD_TTL = 24 * 60 * 60 * 1000;
const OR_TTL = 6 * 60 * 60 * 1000;
const LB_TTL = 6 * 60 * 60 * 1000; // LiveBench 静态 CSV, 6h 足够 (官方月度)
// ponytail: HF 跟 MD 同档 24h 即可. downloads/likes 变化频率不算高 (一周内数量级
// 翻倍已是头部模型爆款), 不需要更短刷新. 匿名限频 ~1000/h 拉 top 5000 一次 ~5s.
const HF_TTL = 24 * 60 * 60 * 1000;

const SOURCE_KEYS = ["arena", "aa", "openrouter", "livebench", "modelsdev", "huggingface"];
const DEFAULT_SOURCES = {
  arena: true,
  aa: true,
  openrouter: true,
  livebench: true,
  modelsdev: true,
  huggingface: true,
};

// 每 getLeaderboard 顶部重置 — module 级, 跨 source 共享, 同 source 在一次调用内只记一次.
let _errors: { source: string; message: string; ts: string }[] = [];

function _resetErrors() {
  _errors = [];
}

function _recordError(source: string, err: any) {
  // ponytail: 同 source 在一次 getLeaderboard 调用里只记一次, 避免重复堆叠
  if (_errors.some((e: any) => e.source === source)) return;
  const msg = (err && err.message) || String(err);
  _errors.push({ source, message: msg, ts: new Date().toISOString() });
}

function _lastErrorFor(source: string): { source: string; message: string; ts: string } | null {
  return _errors.find((e: any) => e.source === source) || null;
}

function _today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 取某源原始 payload（带磁盘缓存 + 过期 stale 回退）。
 * @returns {{raw:object|null, stale:boolean, fromCache:boolean, error:{message:string,ts:string}|null}}
 */
async function getBoardRaw(
  fetcher: any,
  cacheSource: string,
  cacheBoard: string,
  ttl: number,
  force: boolean,
  allowFetch = true,
): Promise<any> {
  const key = cacheKey(cacheSource, cacheBoard, _today());
  let staleRaw: any;
  if (!force) {
    const c = readCache(key);
    if (c && !isStale(c.fetchedAt, ttl)) {
      return { raw: c.data, stale: false, fromCache: true, error: null };
    }
    if (c) {
      // 过期但存在：先作为 stale 回退候选
      staleRaw = c.data;
    }
  }

  // AA 令牌耗尽时不要因为 stale cache 再次触发真实请求；仍然优先把最近缓存交给 UI。
  if (!allowFetch) {
    const cached = readCache(key) || readLatestCache(cacheSource, cacheBoard);
    if (cached) {
      return { raw: cached.data, stale: true, fromCache: true, error: _lastErrorFor(cacheSource) };
    }
    return { raw: null, stale: false, fromCache: false, error: _lastErrorFor(cacheSource) };
  }

  let res: any;
  try {
    res = await fetcher.fetch({});
  } catch (err: any) {
    logFetchError(`agg:${cacheSource}`, err);
    _recordError(cacheSource, err);
    res = { ok: false, data: null };
  }
  if (res && res.ok && res.data) {
    writeCache(key, res.data);
      return { raw: res.data, stale: false, fromCache: false, error: null };
  }
  if (res && res.ok === false) {
    _recordError(cacheSource, new Error(res.error || `${cacheSource} request failed`));
  } else if (!res || !res.data) {
    _recordError(cacheSource, new Error(`${cacheSource} returned an empty payload`));
  }
  // 实时失败：优先用今日过期缓存，再跨日找最近一份，避免新日首次失败直接掉 sample
  if (typeof staleRaw !== "undefined") {
    return { raw: staleRaw, stale: true, fromCache: true, error: _lastErrorFor(cacheSource) };
  }
  const c2 = readCache(key);
  if (c2) return { raw: c2.data, stale: true, fromCache: true, error: _lastErrorFor(cacheSource) };
  const latest = readLatestCache(cacheSource, cacheBoard);
  if (latest) return { raw: latest.data, stale: true, fromCache: true, error: _lastErrorFor(cacheSource) };
  return { raw: null, stale: false, fromCache: false, error: _lastErrorFor(cacheSource) };
}

function normalizeSlice(fetcher: any, wrap: any, source: string): any[] {
  if (!wrap || !wrap.raw) return [];
  try {
    const result = fetcher.normalize(wrap.raw);
    if (!Array.isArray(result)) throw new Error(`${source} returned a non-array normalized payload`);
    return result;
  } catch (err: any) {
    logFetchError(`agg:${source}:normalize`, err);
    _recordError(source, err);
    return [];
  }
}

/** 模型是否与所选 category 匹配（按 board 存在性或 category 字段）。 */
export function matchesCategory(item: any, category: string): boolean {
  const board = (CATEGORY_META[category] && CATEGORY_META[category].board) || "text";
  if (item.arena && item.arena[board]) return true;
  if (item.category === category) return true;
  return false;
}

/**
 * 聚合入口。
 * @param opts
 * @returns {Promise<object>} BoardResult
 */
export async function getLeaderboard(opts: any = {}): Promise<any> {
  _resetErrors();
  const category = CATEGORY_META[opts.category] ? opts.category : "llm";
  const dimension = DIMENSION_META[opts.dimension] ? opts.dimension : "elo";
  const vendor = opts.vendor && opts.vendor !== "all" ? opts.vendor : "all";
  const sortDir = opts.sortDir === "asc" ? "asc" : "desc";
  const search = opts.search || "";
  const force = Boolean(opts.force);

  // ponytail: 独立数据源管控 — caller 传 sources 白名单, 默认仍拉 4 源(向后兼容).
  // 未来 renderer 按 view 决定拉哪些: arena tab 只要 arena+or 兜底, AA tab 只要 aa+or, LB tab 只要 lb+or.
  // 升级路径: 进一步细分 openrouter 为兜底层 (fetch 频率更低, 长 TTL).
  // 有 sources 时它是严格白名单：只有显式 true 才拉取。旧调用未传 sources
  // 时仍保持全源默认，避免把 renderer 的视角切换误判成全量请求。
  const hasSourceFilter = Boolean(opts.sources && typeof opts.sources === "object");
  const sources = hasSourceFilter
    ? Object.fromEntries(SOURCE_KEYS.map((key) => [key, opts.sources[key] === true]))
    : { ...DEFAULT_SOURCES };
  const need = (k: string) => sources[k] === true;

  // 先查 AA 磁盘缓存新鲜度（纯读，不消耗 AA 令牌）。
  const aaKey = cacheKey("artificial-analysis", "llms", _today());
  const aaCached = readCache(aaKey);
  const aaCacheFresh = aaCached && !isStale(aaCached.fetchedAt, AA_TTL);

  // 限流（P1 修正）：
  //   仅当 AA 磁盘缓存「未命中 / 已过期(stale)」或显式 force 刷新时，才消耗令牌去拉 AA；
  //   命中新鲜缓存的纯浏览路径不消耗 AA 令牌，避免重度用户因切换/浏览烧光 1000/日额度。
  //   令牌耗尽时本 tick 不真正打 AA（aaForce=false，仅用 stale 缓存），兜底链行为不变。
  const aaNeedFetch = need("aa") && (force || !aaCacheFresh);
  let aaForce = false;
  if (aaNeedFetch) {
    aaForce = acquire("artificial-analysis");
    if (!aaForce) _recordError("artificial-analysis", new Error("daily request budget exhausted"));
  }

  // ponytail: 按 caller 传入的 sources 白名单独立拉取. openrouter 作为通用兜底层, 任何 view 都拉 (便宜).
  // 主源 = 拉了且能填该 view 的源 (arena 视角: arena; aa 视角: aa; lb 视角: lb).
  const fetches: Promise<any>[] = [];
  // ponytail: v2.8x 扩到 11 arena — 缓存板名带版本后缀 all-v11，废弃旧 5-board 当日缓存，
  // 否则旧缓存 24h 内被当"新鲜"直接返回，新 board（document/search/...）拉不到数据。
  if (need("arena")) fetches.push(getBoardRaw(arenaFetcher, "arena", "all-v11", ARENA_TTL, force));
  if (need("aa")) {
    fetches.push(
      getBoardRaw(
        aaFetcher,
        "artificial-analysis",
        "llms",
        AA_TTL,
        aaForce,
        !aaNeedFetch || aaForce,
      ),
    );
  }
  if (need("openrouter")) fetches.push(getBoardRaw(openrouterFetcher, "openrouter", "models", OR_TTL, force));
  if (need("livebench")) fetches.push(getBoardRaw(livebenchFetcher, "livebench", "table", LB_TTL, force));
  if (need("modelsdev")) fetches.push(getBoardRaw(modelsDevFetcher, "models-dev", "directory", MD_TTL, force));
  if (need("huggingface")) fetches.push(getBoardRaw(huggingfaceFetcher, "huggingface", "top", HF_TTL, force));
  const wraps = await Promise.all(fetches);
  // wraps 顺序对应上面 if 顺序, 解构成命名变量
  let i = 0;
  const arenaWrap = need("arena") ? wraps[i++] : { raw: null, stale: false, fromCache: false };
  const aaWrap    = need("aa")    ? wraps[i++] : { raw: null, stale: false, fromCache: false };
  const orWrap    = need("openrouter") ? wraps[i++] : { raw: null, stale: false, fromCache: false };
  const lbWrap    = need("livebench")  ? wraps[i++] : { raw: null, stale: false, fromCache: false };
  const mdWrap    = need("modelsdev")  ? wraps[i++] : { raw: null, stale: false, fromCache: false };
  const hfWrap    = need("huggingface") ? wraps[i++] : { raw: null, stale: false, fromCache: false };

  // ponytail: 诊断 log — 排查 video board 空数据根因
  console.warn("[agg-diag]", JSON.stringify({ cat: opts.category, dim: opts.dimension, srcOpts: sources, arenaRaw: !!arenaWrap.raw, arenaStale: arenaWrap.stale, arenaFromCache: arenaWrap.fromCache, orRaw: !!orWrap.raw }));

  const arenaModels = normalizeSlice(arenaFetcher, arenaWrap, "arena");
  // 上游 Arena 快照的真实数据截止日期（boards[*].meta.last_updated），透传给前端展示。
  const arenaLastUpdated =
    arenaWrap.raw && typeof arenaWrap.raw.lastUpdated === "string"
      ? arenaWrap.raw.lastUpdated
      : null;
  const aaModels = normalizeSlice(aaFetcher, aaWrap, "artificial-analysis");
  const orModels = normalizeSlice(openrouterFetcher, orWrap, "openrouter");
  const lbModels = normalizeSlice(livebenchFetcher, lbWrap, "livebench");
  const mdModels = normalizeSlice(modelsDevFetcher, mdWrap, "models-dev");
  const hfModels = normalizeSlice(huggingfaceFetcher, hfWrap, "huggingface");

  const arenaSource = arenaModels.length ? SOURCE.LIVE : SOURCE.NONE;
  const aaSource = aaModels.length ? SOURCE.LIVE : SOURCE.NONE;
  const orSource = orModels.length ? SOURCE.LIVE : SOURCE.NONE;
  const lbSource = lbModels.length ? SOURCE.LIVE : SOURCE.NONE;
  // ponytail: MD 是元数据补全层, 没有"主源"概念 — 只要有数据就视作活 (即便 raw 是 stale 缓存, 上游合并也会把 slice 接到其它源模型上)
  const mdSource = mdModels.length ? SOURCE.LIVE : SOURCE.NONE;
  // ponytail: HF 同 MD 模式 — 补全层 (社区信号), 跟主源 (Arena/AA) 正交. 拉到就 live.
  const hfSource = hfModels.length ? SOURCE.LIVE : SOURCE.NONE;

  // ponytail: 兜底策略 — caller 没要的源永远不拉. 主源全失败时, 用 sample 兜底.
  // 注意: 拉到的源里只要有数据就够, 不强制要求 caller 列的每个源都活.
  const sliceList = [arenaModels, aaModels, orModels, lbModels, mdModels, hfModels].filter((arr: any) => arr.length > 0);
  let items: any[];
  let sourcesOut: Record<string, string> = {
    arena: arenaSource,
    aa: aaSource,
    openrouter: orSource,
    livebench: lbSource,
    modelsdev: mdSource,
    huggingface: hfSource,
  };
  if (sliceList.length === 0) {
    // 所有源都空 (caller 列的 + 兜底) → sample
    items = getSampleModels();
    sourcesOut = {
      arena: SOURCE.SAMPLE,
      aa: SOURCE.SAMPLE,
      openrouter: SOURCE.SAMPLE,
      livebench: SOURCE.SAMPLE,
      modelsdev: SOURCE.SAMPLE,
      huggingface: SOURCE.SAMPLE,
    };
  } else {
    items = mergeModelSlices(sliceList);
  }

  // 分类筛选 → 排序 → vendor 筛选 → 搜索
  let shown = items.filter((it: any) => matchesCategory(it, category));
  shown = sortModels(shown, dimension, sortDir, category);
  shown = filterByVendor(shown, vendor);
  shown = filterBySearch(shown, search);

  // v3.0: 排名变动 + 排名趋势序列（仅 Arena 维度有意义）
  if (dimension === "elo") {
    const board = (CATEGORY_META[category] && CATEGORY_META[category].board) || "text";
    const prevRanks = getPreviousArenaRanks();
    // 一次扫描多日缓存，构建所有模型当前 board 的排名序列（供 sparkline）。
    const rankSeriesMap = getArenaRankSeriesMap(14);
    shown = shown.map((it: any, idx: any) => {
      const arenaSlice = it.arena && it.arena[board];
      if (!arenaSlice || typeof arenaSlice.score !== "number") return it;
      const currentRank = idx + 1;
      const { delta, isNew } = computeRankDelta(it.id, board, currentRank, prevRanks);
      const boardSeries =
        rankSeriesMap.get(it.id) && (rankSeriesMap.get(it.id) as any).get(board)
          ? (rankSeriesMap.get(it.id) as any).get(board)
          : null;
      return { ...it, rankDelta: delta, isNew, rankSeries: boardSeries };
    });
  }

  // v2.83: 每源切片覆盖率 — 数据健康看板用
  // (基于筛选后, 用户当前看到的列表计算)
  // ponytail: modelsdev 是元数据补全层, 不参与"主要评估源"健康判断, 但覆盖率仍要计入 (用户能看到上下文/价格).
  const sourceCoverage = {
    arena: shown.filter((it: any) => it.arena && Object.keys(it.arena).length > 0).length,
    aa: shown.filter((it: any) => it.aa && typeof it.aa === "object").length,
    openrouter: shown.filter((it: any) => it.openrouter && typeof it.openrouter === "object").length,
    livebench: shown.filter((it: any) => it.livebench && typeof it.livebench === "object").length,
    modelsdev: shown.filter((it: any) => it.modelsdev && typeof it.modelsdev === "object").length,
    // ponytail: HF 切片覆盖率 — 补全层, 跟 MD 同口径 (有数据对象就算)
    huggingface: shown.filter((it: any) => it.huggingface && typeof it.huggingface === "object").length,
  };

  // 是否整页 sample（决定页头「示例」徽标）
  // lb_* 维度看 livebench source, AA 维度看 aa source, ELO 看 arena source
  const isLbDim = typeof dimension === "string" && dimension.startsWith("lb_");
  const isSample = isLbDim
    ? sourcesOut.livebench === SOURCE.SAMPLE
    : dimension === "elo"
      ? sourcesOut.arena === SOURCE.SAMPLE
      : sourcesOut.aa === SOURCE.SAMPLE;

  // 署名清单（AA 强制；sample 态显式说明）
  const attribution: any[] = [];
  if (sourcesOut.arena === SOURCE.LIVE) attribution.push(ATTRIBUTION["arena-snapshot"]);
  if (sourcesOut.aa === SOURCE.LIVE) attribution.push(ATTRIBUTION["artificial-analysis"]);
  if (sourcesOut.openrouter === SOURCE.LIVE) attribution.push(ATTRIBUTION["openrouter"]);
  if (sourcesOut.livebench === SOURCE.LIVE) attribution.push(ATTRIBUTION["livebench"]);
  if (sourcesOut.modelsdev === SOURCE.LIVE) attribution.push(ATTRIBUTION["models-dev"]);
  // ponytail: HF 补全层, 拉到就署名 (含 url 链接, 符合架构 §12 外部数据源规范)
  if (sourcesOut.huggingface === SOURCE.LIVE) attribution.push(ATTRIBUTION["huggingface"]);
  if (
    sourcesOut.arena === SOURCE.SAMPLE ||
    sourcesOut.aa === SOURCE.SAMPLE ||
    sourcesOut.livebench === SOURCE.SAMPLE
  ) {
    attribution.push(ATTRIBUTION["sample"]);
  }

  const selectedWraps = [
    need("arena") ? arenaWrap : null,
    need("aa") ? aaWrap : null,
    need("openrouter") ? orWrap : null,
    need("livebench") ? lbWrap : null,
    need("modelsdev") ? mdWrap : null,
    need("huggingface") ? hfWrap : null,
  ].filter(Boolean);

  return {
    ok: true,
    category,
    dimension,
    vendor,
    items: shown,
    sources: sourcesOut,
    sourceCoverage,
    attribution,
    count: shown.length,
    stale: selectedWraps.some((wrap: any) => wrap.stale),
    fromCache: selectedWraps.length > 0 && selectedWraps.every((wrap: any) => wrap.fromCache),
    isSample,
    lastUpdated: arenaLastUpdated,
    fetchedAt: new Date().toISOString(),
    rateBudget: { aa: budget("artificial-analysis") },
    errors: [..._errors],
  };
}

module.exports = { getLeaderboard, matchesCategory };
