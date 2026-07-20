/**
 * src/main/ai-leaderboard/ranking.js
 *
 * 纯函数：按 (category, dimension) 排序、按 vendor 筛选、minScore 过滤、vendor 归一。
 * 便于单测（无网络、无副作用）。
 */

const { CATEGORY_META, DIMENSION_META, SOURCE } = require("./types");
const { normalizeVendor } = require("./types");

/**
 * 取某模型在某维度下的排序值（越大越优）。
 * @param {object} item AiModel
 * @param {string} dimension
 * @param {string} board 当前 category 对应的 Arena board
 * @returns {number}
 */
function sortValue(item, dimension, board) {
  if (dimension === "elo") {
    const b = item.arena && item.arena[board];
    return b && Number.isFinite(b.score) ? b.score : -Infinity;
  }
  const aa = item.aa;
  if (!aa) return -Infinity;
  if (dimension === "price_perf") {
    const price = aa.priceBlendedPer1M;
    if (!price || price <= 0) return -Infinity;
    return aa.intelligenceIndex / price;
  }
  const meta = DIMENSION_META[dimension];
  const key = meta && meta.sortKey;
  if (!key || key === "pricePerfProxy") return -Infinity;
  const v = aa[key];
  return typeof v === "number" ? v : -Infinity;
}

/**
 * 按维度排序（默认降序）。
 * @param {object[]} items
 * @param {string} dimension
 * @param {"asc"|"desc"} dir
 * @param {string} category
 * @returns {object[]}
 */
function sortModels(items, dimension, dir = "desc", category = "llm") {
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
 * @param {object[]} items
 * @param {string} vendor 'all' 或 VENDOR_META 键
 * @returns {object[]}
 */
function filterByVendor(items, vendor) {
  if (!vendor || vendor === "all") return items;
  return (items || []).filter((it) => it && it.vendor === vendor);
}

/**
 * 本地标题搜索（名称 / 原始 vendor）。
 * @param {object[]} items
 * @param {string} q
 * @returns {object[]}
 */
function filterBySearch(items, q) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return items;
  return (items || []).filter((it) => {
    const name = (it.name || "").toLowerCase();
    const vendor = ((it.vendorRaw || it.vendor) || "").toLowerCase();
    return name.includes(s) || vendor.includes(s);
  });
}

/** 重新导出（单一真源在 types.js）。 */
module.exports = {
  sortModels,
  filterByVendor,
  filterBySearch,
  normalizeVendor,
  SOURCE,
};
