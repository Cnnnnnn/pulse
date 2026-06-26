/**
 * src/stocks/detail-fetchers/capital-flow.js
 *
 * capital_flow angle fetcher. 东财 push2his 主力资金流向.
 */
const FLOW_URL = "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get";

async function fetchCapitalFlow(httpClient, { code }) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const url = `${FLOW_URL}?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63&klt=1&lmt=15`;
  try {
    const primary = await httpClient.get(url);
    if (primary && primary.ok) {
      const out = parseFlow(primary.body);
      if (out) return { ok: true, data: out };
      return { ok: false, reason: "parse_failed", error: "parse error" };
    }
  } catch (e) { /* fall through */ }
  return { ok: false, reason: "fetch_failed", error: "fetch error" };
}

function parseFlow(body) {
  if (!body || !body.data || !Array.isArray(body.data.klines)) return null;
  const klines = body.data.klines.map((line) => String(line).split(","));
  if (klines.length === 0) return null;
  const main = klines.map((p) => Number(p[1]) || 0);
  const last5 = main.slice(-5).reduce((s, x) => s + x, 0);
  const last10 = main.slice(-10).reduce((s, x) => s + x, 0);
  return { mainNetInflow5d: last5, mainNetInflow10d: last10 };
}

module.exports = { fetchCapitalFlow };