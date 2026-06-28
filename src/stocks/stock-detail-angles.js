/**
 * src/stocks/stock-detail-angles.js
 *
 * 7 个分析角度的注册表. UI / prompt / fetcher / 校验都消费同一份.
 * 新增角度: 1 个 fetcher 文件 + 下方 1 行注册 + 1 个 summarizeForAi.
 */
const ANGLE_DEFS = [
  {
    key: "price_trend",
    label: "价格趋势",
    group: "行情",
    promptHint: "近 30 日收盘价序列、振幅、近 5/20 日涨跌幅",
    dataShape: "PriceTrendData",
    fetcher: require("./detail-fetchers/price-trend").fetchPriceTrend,
    summarizeForAi: summarizePriceTrend,
    sparkline: getSparklineData,
  },
  {
    key: "volume_turnover",
    label: "交易热度",
    group: "行情",
    promptHint: "近 30 日成交额、换手率均值与最新值",
    dataShape: "VolumeTurnoverData",
    fetcher: require("./detail-fetchers/volume-turnover").fetchVolumeTurnover,
    summarizeForAi: summarizeVolumeTurnover,
  },
  {
    key: "valuation",
    label: "估值水位",
    group: "财务",
    promptHint: "动态 PE、PB、近 3 年分位 (若有)",
    dataShape: "ValuationData",
    fetcher: require("./detail-fetchers/valuation").fetchValuation,
    summarizeForAi: summarizeValuation,
  },
  {
    key: "profitability",
    label: "盈利能力",
    group: "财务",
    promptHint: "ROE、毛利率、净利率 (最新报告期)",
    dataShape: "ProfitabilityData",
    fetcher: require("./detail-fetchers/profitability").fetchProfitability,
    summarizeForAi: summarizeProfitability,
  },
  {
    key: "capital_flow",
    label: "资金流向",
    group: "资金",
    promptHint: "近 5/10 日主力净流入额",
    dataShape: "CapitalFlowData",
    fetcher: require("./detail-fetchers/capital-flow").fetchCapitalFlow,
    summarizeForAi: summarizeCapitalFlow,
  },
  {
    key: "tech_indicators",
    label: "技术指标",
    group: "技术",
    promptHint: "MA5/MA10/MA20 位置与 MACD 柱状",
    dataShape: "TechIndicatorData",
    fetcher: require("./detail-fetchers/tech-indicators").fetchTechIndicators,
    summarizeForAi: summarizeTechIndicators,
  },
  {
    key: "news_buzz",
    label: "新闻舆情",
    group: "舆情",
    promptHint: "近 7 日新闻标题与情感倾向",
    dataShape: "NewsBuzzData",
    fetcher: require("./detail-fetchers/news-buzz").fetchNewsBuzz,
    summarizeForAi: summarizeNewsBuzz,
  },
];

function getAngle(key) {
  return ANGLE_DEFS.find((a) => a.key === key) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// summarizeForAi(data) → string: 把 fetcher raw data 归约成 LLM 易读的短文
// (含单位 + 关键趋势, 不再让 LLM 自己算 30 日变化率).
// ponytail: 不做 ML, 不引入新依赖. 一段字符串 < 200 字够 LLM 抓住要点.
//          若新加 angle, 在此补一个 summarizeXxx, 注册表挂上即可.
// ─────────────────────────────────────────────────────────────────────────────

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function numStr(v, digits = 2) {
  const n = num(v);
  return n == null ? null : n.toFixed(digits);
}

function pct(v, digits = 2) {
  const s = numStr(v, digits);
  return s == null ? null : `${s}%`;
}

function billions(v) {
  // 元 → 亿: 1e8
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${(n / 1e8).toFixed(2)} 亿`;
}

function summarizePriceTrend(d) {
  if (!d || !Array.isArray(d.closes) || d.closes.length === 0) return null;
  const closes = d.closes;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const periodPct = first
    ? (((last - first) / first) * 100).toFixed(2)
    : "0.00";
  const min = Math.min(...closes).toFixed(2);
  const max = Math.max(...closes).toFixed(2);
  const c5 = pct(d.change5d);
  const c20 = pct(d.change20d);
  return [
    `${closes.length} 个交易日 close 从 ${first} → ${last} (累计 ${periodPct}%)`,
    `区间最低 ${min} 最高 ${max}`,
    `近 5 日涨跌 ${c5}, 近 20 日涨跌 ${c20}`,
    `日均振幅 ${pct(d.amplitude)}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function getSparklineData(d) {
  if (!d || !Array.isArray(d.closes) || d.closes.length === 0) return null;
  const first = Number(d.closes[0]);
  const last = Number(d.closes[d.closes.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return d.closes;
}


function summarizeVolumeTurnover(d) {
  if (!d) return null;
  const parts = [];
  if (d.avgAmount30d) {
    parts.push(`30 日均成交额 ${billions(d.avgAmount30d)}`);
  }
  if (d.latestAmount) {
    const ratio = d.avgAmount30d
      ? ((d.latestAmount / d.avgAmount30d) * 100).toFixed(0)
      : null;
    parts.push(
      `最新成交额 ${billions(d.latestAmount)}${ratio ? ` (相当于均量 ${ratio}%)` : ""}`,
    );
  }
  if (d.avgTurnover30d != null)
    parts.push(`30 日均换手率 ${pct(d.avgTurnover30d)}`);
  if (d.latestTurnover != null)
    parts.push(`最新换手率 ${pct(d.latestTurnover)}`);
  return parts.length ? parts.join("; ") : null;
}

function summarizeValuation(d) {
  if (!d) return null;
  const parts = [];
  if (d.pe != null) parts.push(`动态 PE ${numStr(d.pe)} 倍`);
  if (d.pb != null) parts.push(`PB ${numStr(d.pb)} 倍`);
  if (d.pePercentile3y != null)
    parts.push(`3 年 PE 分位 ${pct(d.pePercentile3y * 100)}`);
  return parts.length ? parts.join("; ") : "估值数据缺失";
}

function summarizeProfitability(d) {
  if (!d) return null;
  const parts = [];
  if (d.roe != null) parts.push(`ROE ${pct(d.roe)}`);
  if (d.grossMargin != null) parts.push(`毛利率 ${pct(d.grossMargin)}`);
  if (d.netMargin != null) parts.push(`净利率 ${pct(d.netMargin)}`);
  if (parts.length === 0) return "盈利能力数据缺失";
  const suffix =
    d.reportDate && d.reportDate !== "unknown"
      ? ` (报告期 ${d.reportDate})`
      : "";
  return parts.join("; ") + suffix;
}

function summarizeCapitalFlow(d) {
  if (!d) return null;
  if (d.sampleCount === 0) return "该股暂无资金流向数据";
  const parts = [];
  if (d.mainNetInflow5d != null)
    parts.push(`近 5 日主力净流入 ${billions(d.mainNetInflow5d)}`);
  if (d.mainNetInflow10d != null)
    parts.push(`近 10 日主力净流入 ${billions(d.mainNetInflow10d)}`);
  return parts.length ? `${parts.join("; ")} (样本 ${d.sampleCount} 天)` : null;
}

function summarizeTechIndicators(d) {
  if (!d) return null;
  const ma5 = num(d.ma5);
  const ma10 = num(d.ma10);
  const ma20 = num(d.ma20);
  const trend =
    ma5 && ma10 && ma20
      ? ma5 > ma10 && ma10 > ma20
        ? "MA5 > MA10 > MA20 多头排列"
        : ma5 < ma10 && ma10 < ma20
          ? "MA5 < MA10 < MA20 空头排列"
          : "均线交织, 趋势不明"
      : "均线数据不全";
  const macd =
    d.macdHist != null
      ? d.macdHist > 0
        ? `MACD 柱状为正 (${numStr(d.macdHist)}) 多头动能`
        : d.macdHist < 0
          ? `MACD 柱状为负 (${numStr(d.macdHist)}) 空头动能`
          : "MACD 柱状为 0 观望"
      : "";
  return [trend, `MA5=${ma5} MA10=${ma10} MA20=${ma20}`, macd]
    .filter(Boolean)
    .join("; ");
}

function summarizeNewsBuzz(d) {
  if (!d || !Array.isArray(d.items)) return "暂无舆情数据";
  if (d.items.length === 0) return "近 7 日无相关新闻";
  const pos = d.items.filter((i) => i.sentiment === "positive").length;
  const neg = d.items.filter((i) => i.sentiment === "negative").length;
  const neu = d.items.filter((i) => i.sentiment === "neutral").length;
  const top3 = d.items
    .slice(0, 3)
    .map((i) => i.title)
    .join(" / ");
  return `共 ${d.items.length} 条 (正 ${pos} / 负 ${neg} / 中 ${neu}); 近期: ${top3}`;
}

module.exports = { ANGLE_DEFS, getAngle };

