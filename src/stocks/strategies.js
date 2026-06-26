/**
 * src/stocks/strategies.js
 *
 * 4 个内置选股策略. 对照 spec §3.2.
 * 策略硬编码, 不持久化. 点 chip 调 buildCriteria(id) 填充条件区.
 * 选预设后用户仍可在条件区微调 (微调时 store 把 activeStrategy 切成 "custom").
 */
const { DEFAULT_SCREENER_CRITERIA } = require("./stock-constants");

const STRATEGIES = [
  {
    id: "value_roe",
    label: "低估值高ROE",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      peMin: 0, peMax: 20, roeMin: 15, marketCapTier: "large",
    }),
  },
  {
    id: "blue_chip",
    label: "蓝筹白马",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      marketCapTier: "large", roeMin: 15, peMin: 0, peMax: 30,
    }),
  },
  {
    id: "high_div",
    label: "高股息",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      dividendYieldMin: 4, marketCapTier: "large",
    }),
  },
  {
    id: "momentum",
    label: "成长动量",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      change5dMin: 3, roeMin: 10, marketCapTier: "all",
    }),
  },
];

function getStrategy(id) {
  return STRATEGIES.find((s) => s.id === id) || null;
}

/**
 * 按策略 id 生成筛选条件.
 * @param {string} id
 * @returns {object|null} criteria, null 表示 id 未知
 */
function buildCriteria(id) {
  const s = getStrategy(id);
  if (!s) return null;
  return s.buildCriteria();
}

module.exports = { STRATEGIES, getStrategy, buildCriteria };
