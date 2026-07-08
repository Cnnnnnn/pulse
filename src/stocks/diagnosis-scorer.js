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
  // ponytail: 2026-07-07 — 资金流向 fallback 三级. 主路径用 capital_flow. 限流 / 周末时
  // fetcher 走 noData 占位 → sampleCount=0 / mainNetInflow5d=null. 这时不能返 null 让资金
  // 维度消失 (用户报告 19/19 都缺), 退到 volume_turnover.
  //   1) turnover 有 → 换手率档位 (历史经验: A 股日均 ~0.5-1.5%, 活跃 2-5%, 热门 5%+).
  //   2) turnover=0 但 amount 有 (sina fallback 只有成交额没换手率) → 用 latestAmount /
  //      avgAmount30d 做"量比", 量比 >1 = 当日明显放量 = 资金关注. 量比近似换手率, 方向一致.
  //   3) 全无 → null (确实无成交, 维度不评).
  // ceiling: 量比不知道分股流通市值, 不能区分"中字头大票放量" vs "小票放量". 够用但不细.
  const turnoverFallback = (data) => {
    const v = angleData(data, "volume_turnover");
    if (!v) return null;
    const tr = num0(v.latestTurnover);
    if (tr != null && tr > 0) {
      if (tr >= 5) return 7;
      if (tr >= 2) return 6;
      if (tr >= 1) return 5;
      return 4;
    }
    // turnover=0 / null → 试量比 fallback (sina kline 没 turnover 字段时的主路径)
    const latest = num0(v.latestAmount);
    const avg = num0(v.avgAmount30d);
    if (latest == null || avg == null || avg <= 0) return null;
    const ratio = latest / avg;
    if (ratio >= 2) return 6; // 当日 ≥ 2 倍均量, 显著放量
    if (ratio >= 1) return 5; // 不低于均量, 正常偏活跃
    if (ratio >= 0.5) return 4; // 半量以下, 偏淡
    return null; // 接近 0 成交, 不评
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

// ponytail: 2026-07-07 — 基础风险清单 (规则版, 不调 LLM).
// AI 解读改成手动后, RiskCard 不再依赖 aiResult.risks; 用结构化数据本地出 1-3 条.
// 阈值跟 scoreValuation / scoreFundamental / scoreRisk 对齐, 跟评分保持一致口径.
// ceiling: 不覆盖 AI 给的语义化风险 (政策/突发/风格切换), AI 跑了之后 aiResult.risks
//          会替换 (RiskCard 内部去重). 没数据 / 全无信号 → 空数组 (老行为).
export function computeBasicRisks(perAngleData) {
  const out = [];
  // 1) 估值偏高
  const v = angleData(perAngleData, "valuation");
  if (v) {
    const pe = num0(v.pe);
    const pePct = num0(
      perAngleData.peer_compare?.status === "ok"
        ? perAngleData.peer_compare.data?.pePercentile
        : null,
    );
    if (pe != null && pe > 60) {
      out.push(`PE ${pe.toFixed(0)} 偏高, 估值天花板受限`);
    } else if (pePct != null && pePct >= 80) {
      out.push(`PE 处于历史 ${pePct.toFixed(0)}% 分位, 估值偏高`);
    }
  }
  // 2) 资金净流出 (capital_flow.mainNetInflow5d < 0, 排除 sampleCount=0 / 周末)
  const c = angleData(perAngleData, "capital_flow");
  if (c) {
    const inflow = num0(c.mainNetInflow5d);
    if (inflow != null && inflow < -1e8) {
      out.push(`近 5 日主力净流出 ${(inflow / 1e8).toFixed(1)} 亿, 资金面走弱`);
    }
  }
  // 3) 业绩亏损 / 下滑预兆 (earnings_forecast.latest.yoy 严重负)
  const ef = angleData(perAngleData, "earnings_forecast");
  if (ef && ef.latest) {
    const yoy = num0(ef.latest.netProfitYoy);
    if (yoy != null && yoy < -30) {
      out.push(`业绩同比下滑 ${Math.abs(yoy).toFixed(0)}%, 基本面承压`);
    }
  }
  // 4) 舆情偏负
  const nb = angleData(perAngleData, "news_buzz");
  if (nb && Array.isArray(nb.items) && nb.items.length > 0) {
    let pos = 0,
      neg = 0;
    for (const it of nb.items) {
      if (it.sentiment === "positive") pos++;
      else if (it.sentiment === "negative") neg++;
    }
    if (neg > pos && neg >= 2) {
      out.push(`近期舆情偏负面 (${neg} 条负向 vs ${pos} 条正向), 关注情绪面`);
    }
  }
  // 5) 解禁压力 (近 30 天)
  const ce = angleData(perAngleData, "corporate_events");
  if (ce && ce.nearestUnlockDays != null && ce.nearestUnlockDays <= 30) {
    out.push(`${ce.nearestUnlockDays} 天内有解禁, 短期供给压力`);
  }
  return out.slice(0, 3);
}
