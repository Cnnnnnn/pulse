/**
 * src/stocks/market-overview.js
 *
 * 计算当日 A 股市场快照 — 给 AI 推荐 prompt 当上下文.
 * 输入: 全市场 StockRow[] (一般来自 fetchStocks 缓存).
 * 输出: 聚合指标 + 当日日期 + 用于 cache key 的 hash.
 *
 * ponytail: 这是 node-only 模块 (用了 crypto), 不要被 renderer 端 import.
 *          因此独立成文件, 不放在 stock-constants.js 里 (constants 是两端共用).
 *          rows 为空 → 全 null + "无市场数据" 标记, AI 降级为通用知识.
 */

const crypto = require("crypto");

/**
 * 中位数 = 排序后取中间. null/非数过滤后计算.
 * 单元素 → 该元素值; 空数组 → null.
 */
function medianOf(values) {
  const nums = values
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

function percentileOf(values, p) {
  // ponytail: 简单线性插值, 跟 numpy.percentile 默认 linear 一致.
  const nums = values
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  if (p <= 0) return nums[0];
  if (p >= 100) return nums[nums.length - 1];
  const idx = (p / 100) * (nums.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return nums[lo];
  const t = idx - lo;
  return nums[lo] + (nums[hi] - nums[lo]) * t;
}

/**
 * @param {Array<{pe?:number, pb?:number, roe?:number, changePct?:number, turnover?:number, price?:number}>} rows
 * @returns {{
 *   total: number,
 *   date: string,                     // YYYY-MM-DD
 *   peMedian: number|null,
 *   peP30: number|null,
 *   peP70: number|null,
 *   roeMedian: number|null,
 *   changePctMedian: number|null,
 *   turnoverMedian: number|null,
 *   hash: string                      // sha1 截断, 用于 cache key
 * }}
 */
function computeMarketOverview(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const date = new Date().toISOString().slice(0, 10);
  const peValues = safeRows.map((r) => (r ? r.pe : undefined));
  const roeValues = safeRows.map((r) => (r ? r.roe : undefined));
  const changeValues = safeRows.map((r) => (r ? r.changePct : undefined));
  const turnoverValues = safeRows.map((r) => (r ? r.turnover : undefined));
  const total = safeRows.length;
  const peMedian = medianOf(peValues);
  const roeMedian = medianOf(roeValues);
  const changePctMedian = medianOf(changeValues);
  const turnoverMedian = medianOf(turnoverValues);
  const peP30 = percentileOf(peValues, 30);
  const peP70 = percentileOf(peValues, 70);
  const hashBase = [total, peMedian, roeMedian, date].join("|");
  const hash = crypto
    .createHash("sha1")
    .update(hashBase)
    .digest("hex")
    .slice(0, 16);
  return {
    total,
    date,
    peMedian,
    peP30,
    peP70,
    roeMedian,
    changePctMedian,
    turnoverMedian,
    hash,
  };
}

module.exports = {
  computeMarketOverview,
  medianOf,
  percentileOf,
};
