/**
 * src/funds/concentration.ts
 *
 * 阶段 D (蓝图 §3.4): 持仓集中度风险指标. 纯函数, 无副作用, 可单测.
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

function round4(n: any) {
  const r = Math.round(n * 10000) / 10000;
  // +0 化 -0
  return r === 0 ? 0 : r;
}

export function computeConcentration(rowsWithMetrics: any) {
  const rows = Array.isArray(rowsWithMetrics) ? rowsWithMetrics : [];
  const items = rows.map((r: any) => ({
    code: r.holding && r.holding.code,
    name: r.holding && r.holding.name,
    marketValue: (r.metrics && r.metrics.marketValue) || 0,
  }));
  const total = items.reduce((s: number, x: any) => s + x.marketValue, 0);

  if (total <= 0) {
    return { total: 0, weights: [], top3Pct: 0, maxWeight: 0, hhi: 0, warn: false };
  }

  const weights = items.map((x: any) => ({
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
