/**
 * src/funds/concentration.js
 *
 * 阶段 D (蓝图 §3.4): 持仓集中度风险指标. 纯函数, 无副作用, 可单测.
 *
 * 输入 rowsWithMetrics (同 fundStore.rowsWithMetrics.value),
 * 每项含 { holding, metrics:{ marketValue } }.
 *
 * 输出:
 *   - total:        组合总市值
 *   - weights:      [{ code, name, weight }] (weight = marketValue/total)
 *   - top3Pct:      前三大权重之和 * 100
 *   - maxWeight:    单一最大权重 * 100
 *   - hhi:          Σ weight² (0..1)
 *   - warn:         前三大 > 60% 或 HHI > 0.18 (决策 #5)
 *
 * 容错: total<=0 → 全 0, warn=false, 不抛错, 不产出 -0.
 *
 * 警示色走全站 .negative 类 (--color-down), 由调用方 (FundAllocationDonut) 决定.
 * (设计文档曾考虑 --accent-amber, 最终按 PRD D1-2 字面采用 .negative.)
 */

function round4(n) {
  const r = Math.round(n * 10000) / 10000;
  // +0 化 -0
  return r === 0 ? 0 : r;
}

function computeConcentration(rowsWithMetrics) {
  const rows = Array.isArray(rowsWithMetrics) ? rowsWithMetrics : [];
  const items = rows.map((r) => ({
    code: r.holding && r.holding.code,
    name: r.holding && r.holding.name,
    marketValue: (r.metrics && r.metrics.marketValue) || 0,
  }));
  const total = items.reduce((s, x) => s + x.marketValue, 0);

  if (total <= 0) {
    return { total: 0, weights: [], top3Pct: 0, maxWeight: 0, hhi: 0, warn: false };
  }

  const weights = items.map((x) => ({
    code: x.code,
    name: x.name,
    weight: x.marketValue / total,
  }));
  const sorted = [...weights].sort((a, b) => b.weight - a.weight);
  const top3 = sorted.slice(0, 3).reduce((s, x) => s + x.weight, 0);
  const maxW = sorted.length ? sorted[0].weight : 0;
  const hhi = weights.reduce((s, x) => s + x.weight * x.weight, 0);

  const top3Pct = round4(top3 * 100);
  const maxWeight = round4(maxW * 100);
  const hhiR = round4(hhi);
  const warn = top3Pct > 60 || hhiR > 0.18;

  return { total, weights, top3Pct, maxWeight, hhi: hhiR, warn };
}

module.exports = { computeConcentration };
