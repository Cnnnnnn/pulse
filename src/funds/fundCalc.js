/**
 * src/funds/fundCalc.js
 *
 * 基金持仓盈亏计算 —— 纯函数, 无副作用, 全可测.
 *
 * 输入: holdings[] (用户持仓) + navMap (code -> 当前净值/估值快照)
 * 输出: 每只基金的派生字段 (marketValue/profit/profitPct/todayProfit)
 *       + 聚合 (totalMarketValue/totalCost/totalProfit/totalProfitPct/todayProfit)
 *
 * 设计原则:
 *   - 任何字段缺失/null/undefined 都按 0 处理, 不抛错 (UI 层友好)
 *   - 成本为 0 时 profitPct = 0 (避免 Infinity)
 *   - 净值为 0/负数视为数据异常, marketValue = 0, 不参与 todayProfit
 *   - 不读 navMap 里没有的 code (那只基金的 UI 上显示 "净值未拉取")
 *
 * v1.0 (2026-06-12) — 初版
 */

/**
 * 计算单只基金的派生字段.
 * @param {{ shares: number, costNav: number }} holding
 * @param {{ nav: number, estimatedNav?: number, dayChange: number } | null | undefined} navSnap
 * @returns {{
 *   marketValue: number,
 *   costValue: number,
 *   profit: number,
 *   profitPct: number,
 *   todayProfit: number,
 *   usingEstimate: boolean
 * }}
 */
function calcFundMetrics(holding, navSnap) {
  const shares = numOrZero(holding && holding.shares);
  const costNav = numOrZero(holding && holding.costNav);
  const costValue = round2(shares * costNav);

  // navSnap 缺失/异常 -> 市场侧全部按 0
  if (!navSnap) {
    return {
      marketValue: 0,
      costValue,
      profit: costValue === 0 ? 0 : -costValue,  // 拿不到当前净值, 视作全亏 (UI 标灰). 0 化 -0.
      profitPct: 0,
      todayProfit: 0,
      usingEstimate: false,
    };
  }

  const confirmedNav = numOrZero(navSnap.nav);
  const estNav = navSnap.estimatedNav == null ? null : numOrZero(navSnap.estimatedNav);

  // 用估值(今日盘中)还是确认值(收盘后)算 marketValue
  const usingEstimate = estNav != null && estNav > 0;
  const effectiveNav = usingEstimate ? estNav : confirmedNav;

  // 数据异常 (净值 <= 0) 不参与市值/盈亏/今日预估
  if (effectiveNav <= 0) {
    return {
      marketValue: 0,
      costValue,
      profit: costValue === 0 ? 0 : -costValue,  // 0 化 -0
      profitPct: 0,
      todayProfit: 0,
      usingEstimate: false,
    };
  }

  const marketValue = round2(shares * effectiveNav);
  const profit = round2(marketValue - costValue);
  const profitPct = costValue > 0 ? round4((profit / costValue) * 100) : 0;
  const todayProfit = round2(shares * numOrZero(navSnap.dayChange));

  return {
    marketValue,
    costValue,
    profit,
    profitPct,
    todayProfit,
    usingEstimate,
  };
}

/**
 * 聚合一组基金的总览数字.
 * @param {Array<{ holding: any, navSnap: any }>} rows
 * @returns {{
 *   totalMarketValue: number,
 *   totalCost: number,
 *   totalProfit: number,
 *   totalProfitPct: number,
 *   todayProfit: number,
 *   count: number,
 *   countWithNav: number
 * }}
 */
function calcPortfolioTotal(rows) {
  let totalMarketValue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let todayProfit = 0;
  let countWithNav = 0;

  for (const row of rows) {
    const m = calcFundMetrics(row.holding, row.navSnap);
    totalMarketValue += m.marketValue;
    totalCost += m.costValue;
    totalProfit += m.profit;
    todayProfit += m.todayProfit;
    if (m.marketValue > 0) countWithNav++;
  }

  return {
    totalMarketValue: round2(totalMarketValue),
    totalCost: round2(totalCost),
    totalProfit: round2(totalProfit),
    totalProfitPct: totalCost > 0 ? round4((totalProfit / totalCost) * 100) : 0,
    todayProfit: round2(todayProfit),
    count: rows.length,
    countWithNav,
  };
}

/**
 * 按 category 分组 (用于 CategoryTabs 计数 + 分组列表).
 * @param {Array<{ category: string }>} holdings
 * @returns {Record<string, number>}
 */
function groupCountByCategory(holdings) {
  const out = {};
  for (const h of holdings) {
    const k = h && h.category ? h.category : 'other';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * 把 holdings + navMap 拍成 row 数组, 给 calcPortfolioTotal 和 FundList 用.
 * @param {Array} holdings
 * @param {Record<string, any>} navMap
 * @returns {Array<{ holding: any, navSnap: any }>}
 */
function zipHoldingsWithNav(holdings, navMap) {
  const safeMap = navMap || {};
  return (holdings || []).map((h) => ({
    holding: h,
    navSnap: h && h.code ? safeMap[h.code] : null,
  }));
}

/**
 * 给一行加 metrics, 返回 UI 直接用的对象.
 * @param {{ holding: any, navSnap: any }} row
 * @returns {{ holding: any, navSnap: any, metrics: ReturnType<typeof calcFundMetrics> }}
 */
function rowWithMetrics(row) {
  return { ...row, metrics: calcFundMetrics(row.holding, row.navSnap) };
}

// ── helpers ──

function numOrZero(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  // +0 化 -0: r === 0 判的是值相等 (-0 === 0 是 true), 但 return 0 显式产出 +0
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function round4(n) {
  const r = Math.round(n * 10000) / 10000;
  return r === 0 ? 0 : r;
}

module.exports = {
  calcFundMetrics,
  calcPortfolioTotal,
  groupCountByCategory,
  zipHoldingsWithNav,
  rowWithMetrics,
};