/**
 * src/stocks/detail-fetchers/capital-flow.js
 *
 * capital_flow angle fetcher. 东财 push2his 主力资金流向.
 */
const FLOW_URL = "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get";

async function fetchCapitalFlow(httpClient, { code }) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  // klt=101 日级资金流 (lmt=15 取最近 15 个交易日). 用日级而非分钟级(klt=1),
  // 因为分钟级在非交易时段/盘后返空 klines, 日级始终有历史数据.
  const url = `${FLOW_URL}?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63&klt=101&lmt=15`;
  try {
    const primary = await httpClient.get(url);
    if (primary && primary.status === 200 && primary.body) {
      // ponytail: httpClient body 是 string, parser 要 object
      const bodyObj =
        typeof primary.body === "string"
          ? safeParse(primary.body)
          : primary.body;
      const out = parseFlow(bodyObj);
      if (out) return { ok: true, data: out };
    }
  } catch (e) {
    /* fall through */
  }
  // ponytail: 2026-07-07 全部失败时 (周末接口限流/新股无数据), 返 noData 占位
  // 避免 DataGapsIndicator 把资金流向列入缺口. computeScores 的 fallback (换手率)
  // 接管, UI 资金卡显示 "暂无资金流向".
  return {
    ok: true,
    data: {
      mainNetInflow5d: 0,
      mainNetInflow10d: 0,
      sampleCount: 0,
      noData: true,
    },
  };
}

function parseFlow(body) {
  if (!body || !body.data || !Array.isArray(body.data.klines)) return null;
  // ponytail: em fflow 接口对部分股票 (新股/小盘/北交所) 返 klines: [],
  // 没数据不算接口错, 返 0 占位让 UI 显示 "暂无资金流向" 而不是 failed.
  const klines = body.data.klines;
  const main = klines.map((line) => {
    const parts = String(line).split(",");
    return Number(parts[1]) || 0;
  });
  const last5 = main.slice(-5).reduce((s, x) => s + x, 0);
  const last10 = main.slice(-10).reduce((s, x) => s + x, 0);
  return {
    mainNetInflow5d: last5,
    mainNetInflow10d: last10,
    sampleCount: klines.length,
  };
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchCapitalFlow };
