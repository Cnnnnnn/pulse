/**
 * src/main/ai-leaderboard/ranking.ts
 *
 * 纯函数：按 (category, dimension) 排序、按 vendor 筛选、minScore 过滤、vendor 归一。
 * 便于单测（无网络、无副作用）。
 */

const { CATEGORY_META, DIMENSION_META, SOURCE } = require("./types.ts");
const { normalizeVendor } = require("./types.ts");
const { computeTrendingScore } = require("./fetcher-huggingface.ts");

/**
 * 取某模型在某维度下的排序值（越大越优）。
 * @param item AiModel
 * @param dimension
 * @param board 当前 category 对应的 Arena board
 * @returns {number}
 */
export function sortValue(item: any, dimension: string, board: string): number {
  if (dimension === "elo") {
    const b = item.arena && item.arena[board];
    return b && Number.isFinite(b.score) ? b.score : -Infinity;
  }
  // lb_* 维度走 livebench 切片, sortKey 支持 dot path (e.g. "byCategory.Coding")
  if (dimension && dimension.startsWith("lb_")) {
    const lb = item.livebench;
    if (!lb) return -Infinity;
    const meta = DIMENSION_META[dimension];
    const key = meta && meta.sortKey;
    if (!key) return -Infinity;
    const v = key.includes(".")
      ? key.split(".").reduce((o: any, p: string) => (o ? o[p] : null), lb)
      : lb[key];
    return typeof v === "number" && Number.isFinite(v) ? v : -Infinity;
  }
  // ponytail: hf_trending 走 special case (v2.79.6+) — m.huggingface 里没 trendingScore 字段,
  // 实时调 computeTrendingScore(dl, lastModified, createdAt) 算. 必须在 hf_* 通用分支之前,
  // 否则 DIMENSION_META.sortKey="trendingScore" 会被当成 hf["trendingScore"] 读, undefined.
  if (dimension === "hf_trending") {
    const hf = item.huggingface;
    if (!hf) return -Infinity;
    const ts = computeTrendingScore(hf.downloads, hf.lastModified, hf.createdAt);
    return typeof ts === "number" && Number.isFinite(ts) ? ts : -Infinity;
  }
  // ponytail: hf_* 维度走 huggingface 切片, sortKey 直接读 downloads/likes 数字
  // (v2.79.5+). HF 是社区信号维度, 跟 Arena/AA/LB 能力维度完全正交.
  if (dimension && dimension.startsWith("hf_")) {
    const hf = item.huggingface;
    if (!hf) return -Infinity;
    const meta = DIMENSION_META[dimension];
    const key = meta && meta.sortKey;
    if (!key) return -Infinity;
    const v = hf[key];
    return typeof v === "number" && Number.isFinite(v) ? v : -Infinity;
  }
  const aa = item.aa;
  if (!aa) return -Infinity;
  // v2.83: 删除 price_perf 公式, 直接读 priceOutputPer1M (升序 = 越低越优)
  const meta = DIMENSION_META[dimension];
  const key = meta && meta.sortKey;
  if (!key) return -Infinity;
  const v = aa[key];
  return typeof v === "number" ? v : -Infinity;
}

/**
 * 按维度排序（默认降序）。
 * @param items
 * @param dimension
 * @param dir
 * @param category
 * @returns {object[]}
 */
export function sortModels(items: any[], dimension: string, dir: string = "desc", category: string = "llm"): any[] {
  const board = (CATEGORY_META[category] && CATEGORY_META[category].board) || "text";
  const arr = Array.isArray(items) ? items.slice() : [];
  const mul = dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    const va = sortValue(a, dimension, board);
    const vb = sortValue(b, dimension, board);
    if (va === vb) return 0;
    return (va - vb) * mul < 0 ? -1 : 1;
  });
  return arr;
}

/**
 * 按 vendor 筛选。
 * @param items
 * @param vendor 'all' 或 VENDOR_META 键
 * @returns {object[]}
 */
export function filterByVendor(items: any[], vendor: string): any[] {
  if (!vendor || vendor === "all") return items;
  return (items || []).filter((it: any) => it && it.vendor === vendor);
}

/**
 * 本地标题搜索（名称 / 原始 vendor）。
 * @param items
 * @param q
 * @returns {object[]}
 */
export function filterBySearch(items: any[], q: string): any[] {
  const s = (q || "").trim().toLowerCase();
  if (!s) return items;
  return (items || []).filter((it: any) => {
    const name = (it.name || "").toLowerCase();
    const vendor = ((it.vendorRaw || it.vendor) || "").toLowerCase();
    return name.includes(s) || vendor.includes(s);
  });
}

/** 重新导出（单一真源在 types.js）。 */
export { normalizeVendor, SOURCE };
module.exports = {
  sortValue,
  sortModels,
  filterByVendor,
  filterBySearch,
  normalizeVendor,
  SOURCE,
  // 暴露给 hf_trending 测试
  computeTrendingScore,
};
