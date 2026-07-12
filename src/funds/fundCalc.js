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
    return Object.assign(
      baseMetricsZeroMarket(costValue),
      derivedMetrics(0, costValue, holding),
    );
  }

  const confirmedNav = numOrZero(navSnap.nav);
  const estNav = navSnap.estimatedNav == null ? null : numOrZero(navSnap.estimatedNav);

  // 用估值(今日盘中)还是确认值(收盘后)算 marketValue
  const usingEstimate = estNav != null && estNav > 0;
  const effectiveNav = usingEstimate ? estNav : confirmedNav;

  // 数据异常 (净值 <= 0) 不参与市值/盈亏/今日预估
  if (effectiveNav <= 0) {
    return Object.assign(
      baseMetricsZeroMarket(costValue),
      derivedMetrics(0, costValue, holding),
    );
  }

  const marketValue = round2(shares * effectiveNav);
  const profit = round2(marketValue - costValue);
  const profitPct = costValue > 0 ? round4((profit / costValue) * 100) : 0;
  const todayProfit = round2(shares * numOrZero(navSnap.dayChange));

  return Object.assign(
    {
      marketValue,
      costValue,
      profit,
      profitPct,
      todayProfit,
      usingEstimate,
    },
    derivedMetrics(marketValue, costValue, holding),
  );
}

// 市场侧按 0 时共用基础字段
function baseMetricsZeroMarket(costValue) {
  return {
    marketValue: 0,
    costValue,
    profit: costValue === 0 ? 0 : -costValue,  // 拿不到当前净值, 视作全亏 (UI 标灰). 0 化 -0.
    profitPct: 0,
    todayProfit: 0,
    usingEstimate: false,
  };
}

/**
 * T-A1 / T-A2 派生字段: 累计收益额 / 持有期天数 / 年化收益率.
 * 这些只依赖 marketValue / costValue / holding.addedAt, 与市场侧取数方式无关,
 * 所以无论正常/异常分支都统一追加上来.
 *
 * @param {number} marketValue
 * @param {number} costValue
 * @param {{ addedAt?: any }} holding
 */
function derivedMetrics(marketValue, costValue, holding) {
  // 累计收益额 = 市值 - 成本 (手算口径, 与 profit 等同但语义是"持有至今累计")
  const cumulativeProfit = round2(marketValue - costValue);

  // 持有期天数: addedAt 必须是有限数才计; 否则按 0 (无建仓日信息)
  const addedAt = holding && holding.addedAt;
  const holdingDays =
    typeof addedAt === "number" && Number.isFinite(addedAt)
      ? Math.max(0, Math.floor((Date.now() - addedAt) / 86400000))
      : 0;

  // 年化收益率 (百分数, 与 profitPct 同形态): 仅当 持有>=1天 且 成本/市值都>0
  let annualizedPct = null;
  if (holdingDays >= 1 && costValue > 0 && marketValue > 0) {
    annualizedPct = round4((Math.pow(marketValue / costValue, 365 / holdingDays) - 1) * 100);
  }

  return { cumulativeProfit, holdingDays, annualizedPct };
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
 * 在 calcFundMetrics 结果基础上追加派生字段 (阶段 A):
 *   - holdingDays:     今天 - addedAt 折算的自然天数 (addedAt 缺失/非法 → 0)
 *   - cumulativeProfit:简单口径 当前市值 - costValue (marketValue - costValue)
 *   - annualizedPct:   简单年化 (市值/成本)^(365/持有天数) - 1, 百分比数值;
 *                      成本<=0 或 持有天数<=0 → null (UI 显示 "--")
 * 容错沿用 calcFundMetrics: 字段缺失/null/0 按 0, 不抛错, 不产出 -0.
 * @param {{ holding: any, navSnap: any }} row
 * @returns {{ holding: any, navSnap: any, metrics: ReturnType<typeof calcFundMetrics> & { holdingDays: number, cumulativeProfit: number, annualizedPct: number|null } }}
 */
function rowWithMetrics(row) {
  const metrics = calcFundMetrics(row.holding, row.navSnap);

  // 持有天数: 按自然日截断, 不四舍五入
  let holdingDays = 0;
  const addedAt = row.holding && row.holding.addedAt;
  if (addedAt) {
    const t = typeof addedAt === "number" ? addedAt : Date.parse(addedAt);
    if (Number.isFinite(t)) {
      const diff = Date.now() - t;
      holdingDays = diff > 0 ? Math.floor(diff / 86400000) : 0;
    }
  }

  const marketValue = metrics.marketValue;
  const costValue = metrics.costValue;
  const cumulativeProfit = round2(marketValue - costValue);

  // 简单年化: 成本<=0 或 持有<=0 天 → null (UI 显示 "--")
  let annualizedPct = null;
  if (costValue > 0 && holdingDays > 0) {
    const ratio = marketValue / costValue;
    if (ratio > 0) {
      annualizedPct = round4((Math.pow(ratio, 365 / holdingDays) - 1) * 100);
    }
  }

  return {
    ...row,
    metrics: Object.assign({}, metrics, { holdingDays, cumulativeProfit, annualizedPct }),
  };
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