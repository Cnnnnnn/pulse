/**
 * src/stocks/stock-detail-angles.js
 *
 * 12 个分析角度的注册表. UI / prompt / fetcher / 校验都消费同一份.
 * 新增角度: 1 个 fetcher 文件 + 下方 1 行注册 + 1 个 summarizeForAi.
 *
 * ponytail: 2026-07-07 — 删 industry_momentum (东方财富 90.BKxxxx K 线周末永远空) +
 * margin_trading (节假日/小盘股经常无数据), 留 12 个里有数据的: 9 基础 + 3 新 (业绩
 * 预期 / 股东结构 / 股本事件) 都是季频/静态, 数据节奏稳定.
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
  {
    key: "peer_compare",
    label: "同业对比",
    group: "财务",
    promptHint: "PE / PB 相对行业中位 + 这只的排名",
    dataShape: "PeerCompareData",
    fetcher: require("./detail-fetchers/peer-compare").fetchPeerCompare,
    summarizeForAi: summarizePeerCompare,
  },
  {
    key: "moat_score",
    label: "护城河",
    group: "财务",
    promptHint: "3 维护城河评分 (毛利 / ROIC / 营收稳定度)",
    dataShape: "MoatScoreData",
    fetcher: require("./detail-fetchers/moat-score").fetchMoatScore,
    summarizeForAi: summarizeMoatScore,
  },
  {
    key: "earnings_forecast",
    label: "业绩预期",
    group: "预期",
    promptHint: "近 4 次业绩预告/快报 (类型 + 同比变化 + 原因)",
    dataShape: "EarningsForecastData",
    fetcher: require("./detail-fetchers/earnings-forecast")
      .fetchEarningsForecast,
    summarizeForAi: summarizeEarningsForecast,
  },
  {
    key: "shareholders",
    label: "股东结构",
    group: "股东",
    promptHint: "股东人数季环比 + 机构持仓比例季环比",
    dataShape: "ShareholdersData",
    fetcher: require("./detail-fetchers/shareholders").fetchShareholders,
    summarizeForAi: summarizeShareholders,
  },
  {
    key: "corporate_events",
    label: "股本事件",
    group: "股本",
    promptHint: "近期分红 / 解禁 / 配股 (含下次解禁天数)",
    dataShape: "CorporateEventsData",
    fetcher: require("./detail-fetchers/corporate-events").fetchCorporateEvents,
    summarizeForAi: summarizeCorporateEvents,
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

function summarizePeerCompare(d) {
  if (!d) return null;
  const parts = [];
  // PE/PB: 改用历史分位 (INDEX_PERCENTILE) + 估值状态. 旧的行业中位/排名字段已废弃.
  if (d.pe != null) {
    const pct =
      d.pePercentile != null ? `, 历史 ${d.pePercentile.toFixed(0)}% 分位` : "";
    const st = d.peValuationStatus ? ` (${d.peValuationStatus})` : "";
    parts.push(`PE ${d.pe.toFixed(1)} 倍${pct}${st}`);
  }
  if (d.pb != null) {
    const pct =
      d.pbPercentile != null ? `, 历史 ${d.pbPercentile.toFixed(0)}% 分位` : "";
    const st = d.pbValuationStatus ? ` (${d.pbValuationStatus})` : "";
    parts.push(`PB ${d.pb.toFixed(2)}${pct}${st}`);
  }
  // 行业 ROE/毛利率中位 (从 LICO_FN_CPD peers 客户端算)
  if (d.roeIndustryMedian != null)
    parts.push(`行业 ROE 中位 ${d.roeIndustryMedian.toFixed(1)}%`);
  if (d.grossMarginIndustryMedian != null)
    parts.push(`行业毛利率中位 ${d.grossMarginIndustryMedian.toFixed(1)}%`);
  if (parts.length === 0) return "暂无同业数据";
  // ponytail: 行业名是 LLM 分析 "同业对比" 时不可缺的高价值上下文, prepend 一段.
  //          仅当 industry 存在时输出, fetcher 在 datacenter row 缺 INDUSTRY_NAME 时会返 ok=false,
  //          但本函数仍需对 caller 传的部分数据保持防御 (测试也喂了无 industry 的 fixture).
  const industryPrefix = d.industry ? `行业: ${d.industry}. ` : "";
  return industryPrefix + parts.join("; ");
}

function summarizeMoatScore(d) {
  if (!d || d.score == null) return null;
  const breakdown = d.breakdown || {};
  const dims = [];
  if (breakdown.marginEdge != null) dims.push(`毛利 ${breakdown.marginEdge}/3`);
  if (breakdown.roicEdge != null) dims.push(`ROIC ${breakdown.roicEdge}/3`);
  if (breakdown.revenueStability != null)
    dims.push(`营收 ${breakdown.revenueStability}/3`);
  // ponytail: buildNote() 已经把分数翻译成了 "强护城河 / 数据缺失 X 维度" 等 LLM 直读的判断,
  //          防御性处理 null/空字符串, 避免显示 "— undefined".
  const noteSuffix = d.note ? ` — ${d.note}` : "";
  return `护城河 ${d.score}/9 (${dims.join(" + ")})${noteSuffix}`;
}

// ── 业绩预期 (earnings_forecast) ──
function summarizeEarningsForecast(d) {
  if (!d) return null;
  if (!d.items || d.items.length === 0) return "近期无业绩预告/快报披露";
  const latest = d.latest || d.items[0];
  const type = latest.type || "披露";
  const change = formatChangeRange(latest.changeMin, latest.changeMax);
  const latestLine = `最新 (${latest.reportDate || "?"}) ${type}${change}`;
  // ponytail: 多条时给"趋势": 看最近 4 期类型 (预增→预增→预减 = 趋势转弱).
  const trendLine = summarizeForecastTrend(d.items);
  return [latestLine, trendLine].filter(Boolean).join("; ");
}

function formatChangeRange(min, max) {
  if (min == null && max == null) return "";
  if (min != null && max != null) {
    // ponytail: 同一区间 (预增 50%-80%) vs 不同区间 (扭亏) 都支持.
    if (min === max) return ` 同比 ${min > 0 ? "+" : ""}${min}%`;
    return ` 同比 ${min > 0 ? "+" : ""}${min}% ~ ${max > 0 ? "+" : ""}${max}%`;
  }
  const v = min != null ? min : max;
  return ` 同比 ${v > 0 ? "+" : ""}${v}%`;
}

// ponytail: 把 4 期类型翻译成 LLM 直读的趋势.
//   全部预增 → "趋势持续向好"; 预增→预减 → "趋势转弱"; 全部预减 → "趋势持续承压".
function summarizeForecastTrend(items) {
  if (!items || items.length < 2) return null;
  const tone = (t) => {
    if (!t) return 0;
    if (t.includes("增") || t.includes("扭亏")) return 1;
    if (t.includes("减") || t.includes("首亏") || t.includes("续亏")) return -1;
    return 0;
  };
  const tones = items.map((it) => tone(it.type));
  const pos = tones.filter((t) => t > 0).length;
  const neg = tones.filter((t) => t < 0).length;
  if (pos === tones.length) return "趋势: 连续向好";
  if (neg === tones.length) return "趋势: 持续承压";
  if (pos > 0 && neg > 0) return "趋势: 由好转弱";
  return null;
}

// ── 股东结构 (shareholders) ──
function summarizeShareholders(d) {
  if (!d) return null;
  const parts = [];
  if (d.holderCountLatest != null) {
    const chg = d.holderCountChangePct;
    const chgStr =
      chg != null ? ` (环比 ${chg > 0 ? "+" : ""}${chg.toFixed(2)}%)` : "";
    parts.push(
      `股东人数 ${(d.holderCountLatest / 10000).toFixed(2)} 万${chgStr} (${d.reportDate || "?"})`,
    );
  }
  if (d.institutionPctLatest != null) {
    const chg = d.institutionChangePct;
    const chgStr =
      chg != null ? ` (环比 ${chg > 0 ? "+" : ""}${chg.toFixed(2)}pct)` : "";
    parts.push(
      `机构持仓 ${d.institutionPctLatest.toFixed(2)}%${chgStr} (${d.institutionReportDate || "?"})`,
    );
  }
  if (parts.length === 0) return "暂无股东结构数据";
  return parts.join("; ");
}

// ── 股本事件 (corporate_events) ──
function summarizeCorporateEvents(d) {
  if (!d) return null;
  const parts = [];
  // 分红: 最近一次 (含 派现 / 送股)
  if (d.dividends && d.dividends.length > 0) {
    const latest = d.dividends[0];
    const divParts = [];
    if (latest.cashBonus != null)
      divParts.push(`派现 ${latest.cashBonus}/10 股`);
    if (latest.shareBonus != null && latest.shareBonus > 0)
      divParts.push(`送股 ${latest.shareBonus}/10 股`);
    if (divParts.length > 0)
      parts.push(
        `最新分红 (${latest.reportDate || "?"}) ${divParts.join(" + ")}`,
      );
  }
  // 解禁: 距离下次解禁天数 + 比例
  if (d.nearestUnlockDays != null) {
    const ratio =
      d.unlocks && d.unlocks[0] && d.unlocks[0].ratio != null
        ? ` 占总股本 ${d.unlocks[0].ratio.toFixed(2)}%`
        : "";
    const timing =
      d.nearestUnlockDays >= 0
        ? `距今 ${d.nearestUnlockDays} 天`
        : `${Math.abs(d.nearestUnlockDays)} 天前已解禁`;
    parts.push(`下次解禁 (${d.unlocks[0].limitDate}) ${timing}${ratio}`);
  }
  // 配股 / 增发
  if (d.offerings && d.offerings.length > 0) {
    const latest = d.offerings[0];
    parts.push(
      `最近融资 (${latest.issueDate || "?"}) ${latest.issueType || "增发"}`,
    );
  }
  if (parts.length === 0) return "近期无股本事件";
  return parts.join("; ");
}

module.exports = { ANGLE_DEFS, getAngle };
