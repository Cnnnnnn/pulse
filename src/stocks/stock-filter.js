/**
 * src/stocks/stock-filter.js
 *
 * 纯函数: 按条件 filter + 按列 sort. 无 IO, 可单测.
 *
 * 对照 spec §5 — 关键语义: filter 对 null 字段"跳过该条件"而非"判为不满足".
 * 即某只票的 pe 字段是 null (东财接口没返回), 不会因为 peMax=20 被排除,
 * 而是跳过 pe 这一条条件, 继续看其它条件. 这是筛选器质量的核心.
 */
const {
  tierForMarketCap,
  DEFAULT_SCREENER_CRITERIA,
} = require("./stock-constants");

// 区间过滤项: [rowKey, minCriteriaKey, maxCriteriaKey]
const RANGE_FILTERS = [
  ["pe", "peMin", "peMax"],
  ["pb", "pbMin", "pbMax"],
  ["turnover", "turnoverMin", "turnoverMax"],
];
// 下限过滤项: [rowKey, minCriteriaKey]
const MIN_FILTERS = [
  ["roe", "roeMin"],
  ["dividendYield", "dividendYieldMin"],
  ["change5d", "change5dMin"],
];

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 按条件过滤.
 * @param {Array} rows  StockRow[]
 * @param {object} criteria  跟 DEFAULT_SCREENER_CRITERIA 同形 (缺字段自动补默认)
 * @returns {Array} 过滤后的新数组 (不改原数组)
 */
function filterStocks(rows, criteria) {
  if (!Array.isArray(rows)) return [];
  const c = Object.assign({}, DEFAULT_SCREENER_CRITERIA, criteria || {});
  return rows.filter((r) => matchCriteria(r, c));
}

function matchCriteria(r, c) {
  if (!r || typeof r !== "object") return false;

  // 区间过滤
  for (const [rowKey, minKey, maxKey] of RANGE_FILTERS) {
    const val = r[rowKey];
    if (!isNum(val)) continue; // 数据缺失 → 跳过该条件
    const lo = c[minKey];
    const hi = c[maxKey];
    if (isNum(lo) && val < lo) return false;
    if (isNum(hi) && val > hi) return false;
  }
  // 下限过滤
  for (const [rowKey, minKey] of MIN_FILTERS) {
    const val = r[rowKey];
    if (!isNum(val)) continue;
    const lo = c[minKey];
    if (isNum(lo) && val < lo) return false;
  }
  // 市值分档
  if (c.marketCapTier && c.marketCapTier !== "all") {
    const tier = tierForMarketCap(r.marketCap);
    if (tier !== c.marketCapTier) return false;
  }
  // 行业 (空数组 = 全行业)
  if (Array.isArray(c.industries) && c.industries.length > 0) {
    if (!c.industries.includes(r.industry)) return false;
  }
  return true;
}

/**
 * 按列排序. 数字按数值排, 字符串按 localeCompare.
 * null/undefined 排尾 (与方向无关, 不让坏数据污染排序).
 *
 * ponytail: 东财 clist 翻页拉全量时, 后端只能按 fid (数值列) 排; 字符串列
 *          (name/industry) 必须前端重排, 否则用户点 "名称" 列看到的是后端默认 ROE 排序.
 * @param {Array} rows
 * @param {{key:string, dir:"asc"|"desc"}|null} sort
 * @returns {Array} 排序后的新数组
 */
function sortStocks(rows, sort) {
  if (!Array.isArray(rows)) return [];
  if (!sort || !sort.key) return [...rows];
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a ? a[sort.key] : undefined;
    const bv = b ? b[sort.key] : undefined;
    const aBad = av == null || av === "";
    const bBad = bv == null || bv === "";
    if (aBad && bBad) return 0;
    if (aBad) return 1; // 坏数据永远排尾 (跟方向无关)
    if (bBad) return -1;
    // 数字按数值, 字符串按 localeCompare. 混合类型按数字优先.
    if (isNum(av) && isNum(bv)) {
      if (av === bv) return 0;
      return av < bv ? -dir : dir;
    }
    const cmp = String(av).localeCompare(String(bv), "zh-Hans-CN");
    if (cmp === 0) return 0;
    return cmp < 0 ? -dir : dir;
  });
}

/** filter + sort 复合 (stocks:screen IPC 用) */
function applyScreen(rows, criteria, sort) {
  return sortStocks(filterStocks(rows, criteria), sort);
}

module.exports = { filterStocks, sortStocks, applyScreen, matchCriteria };
