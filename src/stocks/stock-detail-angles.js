/**
 * src/stocks/stock-detail-angles.js
 *
 * 7 个分析角度的注册表. UI / prompt / fetcher / 校验都消费同一份.
 * 新增角度: 1 个 fetcher 文件 + 下方 1 行注册.
 */
const ANGLE_DEFS = [
  {
    key: "price_trend",
    label: "价格趋势",
    group: "行情",
    promptHint: "近 30 日收盘价序列、振幅、近 5/20 日涨跌幅",
    dataShape: "PriceTrendData",
    fetcher: require("./detail-fetchers/price-trend").fetchPriceTrend,
    sparkline: getSparklineData,
  },
  {
    key: "volume_turnover",
    label: "交易热度",
    group: "行情",
    promptHint: "近 30 日成交额、换手率均值与最新值",
    dataShape: "VolumeTurnoverData",
    fetcher: require("./detail-fetchers/volume-turnover").fetchVolumeTurnover,
  },
  {
    key: "valuation",
    label: "估值水位",
    group: "财务",
    promptHint: "动态 PE、PB、近 3 年分位 (若有)",
    dataShape: "ValuationData",
    fetcher: require("./detail-fetchers/valuation").fetchValuation,
  },
  {
    key: "profitability",
    label: "盈利能力",
    group: "财务",
    promptHint: "ROE、毛利率、净利率 (最新报告期)",
    dataShape: "ProfitabilityData",
    fetcher: require("./detail-fetchers/profitability").fetchProfitability,
  },
  {
    key: "capital_flow",
    label: "资金流向",
    group: "资金",
    promptHint: "近 5/10 日主力净流入额",
    dataShape: "CapitalFlowData",
    fetcher: require("./detail-fetchers/capital-flow").fetchCapitalFlow,
  },
  {
    key: "tech_indicators",
    label: "技术指标",
    group: "技术",
    promptHint: "MA5/MA10/MA20 位置与 MACD 柱状",
    dataShape: "TechIndicatorData",
    fetcher: require("./detail-fetchers/tech-indicators").fetchTechIndicators,
  },
  {
    key: "news_buzz",
    label: "新闻舆情",
    group: "舆情",
    promptHint: "近 7 日新闻标题与情感倾向",
    dataShape: "NewsBuzzData",
    fetcher: require("./detail-fetchers/news-buzz").fetchNewsBuzz,
  },
];

function getAngle(key) {
  return ANGLE_DEFS.find((a) => a.key === key) || null;
}

function getSparklineData(d) {
  if (!d || !Array.isArray(d.closes) || d.closes.length === 0) return null;
  const first = Number(d.closes[0]);
  const last = Number(d.closes[d.closes.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return d.closes;
}

module.exports = { ANGLE_DEFS, getAngle };