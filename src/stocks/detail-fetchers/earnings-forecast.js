/**
 * src/stocks/detail-fetchers/earnings-forecast.js
 *
 * earnings_forecast angle fetcher. 业绩预告 / 业绩快报 (东方财富 RPT_RES_FORECAST_MAINBZB).
 *
 * ponytail: 数据源只在"公告披露季" (1月底 / 4月底 / 7月底 / 10月底) 才有最新数据, 其
 * 余时段拿不到. 此时返 {ok: true, data: {items: []}}, UI 显示"暂无业绩预告" — 不算失败.
 *
 * data = {
 *   items: [{ reportDate, type, changeMin, changeMax, reason }],
 *   latest: { reportDate, type, changeMin, changeMax, reason } | null
 * }
 */
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";

async function fetchEarningsForecast(httpClient, { code }) {
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  // RPT_RES_FORECAST_MAINBZB: 业绩快报 + 业绩预告合并, 包含: REPORT_DATE, PREDICT_TYPE
  // (预增/预减/扭亏/续亏/略增/略减/首亏/不确定), CHANGE_RATE_MIN/MAX, PREDICT_REASON.
  // 取最近 4 个报告期足够.
  const url =
    `${DATACENTER_URL}?reportName=RPT_RES_FORECAST_MAINBZB` +
    `&columns=ALL&filter=${filter}&pageNumber=1&pageSize=4` +
    `&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC`;
  let res;
  try {
    res = await httpClient.get(url, { timeout: 8000 });
  } catch (_) {
    return {
      ok: false,
      reason: "fetch_failed",
      error: "datacenter request failed",
    };
  }
  if (!res || res.status !== 200 || !res.body) {
    return { ok: false, reason: "fetch_failed", error: "empty response" };
  }
  const body = typeof res.body === "string" ? safeJson(res.body) : res.body;
  const rows =
    body && body.result && Array.isArray(body.result.data)
      ? body.result.data
      : [];
  // ponytail: 0 rows = "该股近期没披露业绩预告" — 返 ok + 空 items, 跟 news_buzz 一致
  // 让 UI 显示"暂无业绩预告"而非 "数据缺失" (后者会让用户以为出 bug).
  if (rows.length === 0) {
    return { ok: true, data: { items: [], latest: null } };
  }
  const items = rows.map(parseRow).filter(Boolean);
  return {
    ok: true,
    data: { items, latest: items[0] || null },
  };
}

function parseRow(row) {
  if (!row) return null;
  return {
    reportDate: (row.REPORT_DATE || "").slice(0, 10) || null,
    type: row.PREDICT_TYPE || null, // "预增" / "预减" / "扭亏" ...
    changeMin: num(row.CHANGE_RATE_MIN),
    changeMax: num(row.CHANGE_RATE_MAX),
    reason: row.PREDICT_REASON || null,
  };
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchEarningsForecast };
