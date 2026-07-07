/**
 * 个股诊断 5 维评分 — 纯函数, 确定性 (同输入同输出).
 * 参照 moat-score.js 的硬编码阈值机制. 评分 0-10, 数据缺失返回 null.
 * Spec: docs/superpowers/specs/2026-07-04-stock-diagnosis-redesign-design.md §4
 */

// num: 接受 0 (区别于 profitability fetcher 把 0 当 null 的行为)
function num0(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function angleData(perAngleData, key) {
  const e = perAngleData && perAngleData[key];
  return e && e.status === "ok" ? e.data || {} : null;
}

// ── 基本面 ──
function scoreFundamental(data) {
  const prof = angleData(data, "profitability");
  if (!prof) return null;
  const roe = num0(prof.roe);
  if (roe === null) return null;
  if (roe >= 20) return 8;
  if (roe >= 15) return 6;
  if (roe >= 10) return 4;
  return 2;
}

function scoreValuation(data) {
  const v = angleData(data, "valuation");
  if (!v) return null;
  const pe = num0(v.pe);
  if (pe === null || pe <= 0) return null; // 亏损/缺 EPS
  if (pe <= 15) return 8;
  if (pe <= 25) return 6;
  if (pe <= 40) return 4;
  if (pe <= 60) return 3;
  return 2;
}

function scoreCapital(data) {
  const c = angleData(data, "capital_flow");
  // ponytail: 2026-07-07 — 资金流向依赖当日行情, 周末/节假日 fetch 失败时维度 null →
  // UI "—". fallback: volume_turnover 返的 latestTurnover 是最新一日换手率 %,
  // avgTurnover30d 是 30 日均换手率 %. 换手率高 = 资金关注度高 = 中性偏正.
  const turnoverFallback = (data) => {
    const v = angleData(data, "volume_turnover");
    if (!v) return null;
    const tr = num0(v.latestTurnover);
    if (tr == null) return null;
    // ponytail: 换手率门槛. A 股日均换手 ~0.5-1.5%, 活跃股 2-5%, 短线热门 5%+.
    if (tr >= 5) return 7;
    if (tr >= 2) return 6;
    if (tr >= 1) return 5;
    if (tr > 0) return 4;
    return null;
  };
  if (!c || !c.sampleCount) {
    return turnoverFallback(data);
  }
  const inflow = num0(c.mainNetInflow5d);
  if (inflow === null) {
    return turnoverFallback(data);
  }
  if (inflow > 0) {
    if (inflow > 5e8) return 8;
    if (inflow > 1e8) return 7;
    return 6;
  }
  if (inflow < -5e8) return 2;
  if (inflow < -1e8) return 3;
  return 4;
}

function scoreTech(data) {
  const t = angleData(data, "tech_indicators");
  if (!t) return null;
  const macdHist = num0(t.macdHist);
  const ma5 = num0(t.ma5);
  const ma20 = num0(t.ma20);
  // fetcher 的 ma() 长度不足返 0, 用 ma20===0 判数据不足
  if (macdHist === null || !ma20) return null;
  const bullishAlign = ma5 && ma20 && ma5 > ma20;
  if (macdHist > 0 && bullishAlign) return 8;
  if (macdHist > 0) return 6;
  if (macdHist < 0) return 3;
  return 5;
}

function scoreRisk(data) {
  const v = angleData(data, "valuation");
  if (!v) return null;
  const pe = num0(v.pe);
  if (pe === null || pe <= 0) return null;
  let base;
  if (pe <= 15) base = 8;
  else if (pe <= 25) base = 7;
  else if (pe <= 40) base = 6;
  else if (pe <= 60) base = 5;
  else if (pe <= 80) base = 4;
  else base = 2;
  // news_buzz.data = { items: [{ title, date, sentiment }] } — 聚合多数情感倾向
  const sentiment = aggregateNewsSentiment(angleData(data, "news_buzz"));
  if (sentiment === "negative") base = Math.max(2, base - 1);
  else if (sentiment === "positive") base = Math.min(8, base + 1);
  return base;
}

// news_buzz 把情感标在每个 item 上, 这里聚合为整体倾向 (多数票). 无 items/空 → null.
function aggregateNewsSentiment(news) {
  if (!news || !Array.isArray(news.items) || news.items.length === 0)
    return null;
  let pos = 0,
    neg = 0;
  for (const it of news.items) {
    if (it.sentiment === "positive") pos++;
    else if (it.sentiment === "negative") neg++;
  }
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return null;
}

const DIMENSIONS = [
  ["fundamental", scoreFundamental, 0.25],
  ["valuation", scoreValuation, 0.2],
  ["capital", scoreCapital, 0.15],
  ["tech", scoreTech, 0.15],
  ["risk", scoreRisk, 0.25],
];

export function computeScores(perAngleData) {
  const dimensions = {};
  const rationale = [];
  for (const [key, fn] of DIMENSIONS) {
    dimensions[key] = fn(perAngleData);
  }
  // overall: 非 null 维度按权重加权平均 (权重在缺维度的剩余维度间按比例重分配)
  const present = DIMENSIONS.filter(([key]) => dimensions[key] !== null);
  let overall = null;
  if (present.length > 0) {
    const wsum = present.reduce((s, d) => s + d[2], 0);
    overall = present.reduce(
      (s, [k, , w]) => s + dimensions[k] * (w / wsum),
      0,
    );
    overall = Math.round(overall * 10) / 10;
  }
  if (dimensions.valuation !== null) {
    const pe = num0(angleData(perAngleData, "valuation")?.pe);
    if (pe !== null)
      rationale.push(
        `PE ${pe}，估值${pe <= 25 ? "合理" : pe <= 60 ? "偏高" : "过高"}`,
      );
  }
  if (dimensions.fundamental !== null) {
    const roe = num0(angleData(perAngleData, "profitability")?.roe);
    if (roe !== null)
      rationale.push(`ROE ${roe}%，${roe >= 15 ? "盈利能力强" : "盈利一般"}`);
  }
  return { overall, dimensions, rationale };
}
