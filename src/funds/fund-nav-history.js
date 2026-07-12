// src/funds/fund-nav-history.js
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const REF = "https://fundf10.eastmoney.com/";

function parseLsjzResponse(json) {
  const list = json && json.Data && Array.isArray(json.Data.LSJZList) ? json.Data.LSJZList : null;
  if (!list) throw new Error("unexpected lsjz shape");
  const out = [];
  for (const row of list) {
    const nav = parseFloat(row.DWJZ);
    if (!row.FSRQ || !Number.isFinite(nav)) continue; // 过滤无效
    out.push({ date: String(row.FSRQ), nav });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

async function fetchFundNavHistory(code, httpClient, opts = {}) {
  if (!/^\d{6}$/.test(String(code || ""))) return { ok: false, series: [], reason: "invalid_code" };
  const days = opts.days || 30;
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${days}`;
  try {
    const r = await httpClient.get(url, {
      headers: { "User-Agent": UA, Referer: REF },
      timeout: opts.timeoutMs ?? 8000,
    });
    if (r.error === "network" || r.error === "timeout") return { ok: false, series: [], reason: r.error };
    if (r.status !== 200) return { ok: false, series: [], reason: `HTTP ${r.status}` };
    const series = parseLsjzResponse(JSON.parse(r.body || "{}"));
    return { ok: true, series, reason: null };
  } catch (e) {
    return { ok: false, series: [], reason: e && e.message ? e.message : String(e) };
  }
}

// ── T-C1a: 基准指数历史 (eastmoney push2his kline) ──
// 本轮回单基准 = 沪深300 (symbol "000300", secid "1.000300"), 日级缓存.
// symbol 入参 + secid 参数已预留多基准扩展位, 本轮回不扩.
const IDX_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const IDX_REF = "https://quote.eastmoney.com/";
const IDX_SECID_PREFIX = "1."; // 上交所指数 secid 前缀
const INDEX_DEFAULT_DAYS = 365;

/**
 * 解析 eastmoney 指数 kline 响应.
 * 期望 json.data.klines = ["YYYY-MM-DD,close", ...].
 * 映射成升序 [{ date, value }], 过滤无效行. 形状异常 → 抛错 (交由 fetchIndexHistory 捕获).
 */
function parseIndexResponse(json) {
  const list =
    json && json.data && Array.isArray(json.data.klines)
      ? json.data.klines
      : null;
  if (!list) throw new Error("unexpected index kline shape");
  const out = [];
  for (const line of list) {
    const parts = String(line).split(",");
    const date = parts[0];
    const value = parseFloat(parts[1]);
    if (!date || !Number.isFinite(value)) continue; // 过滤无效
    out.push({ date, value });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/**
 * 拉取基准指数历史.
 * @param {string} symbol 指数代码 (6 位数字, e.g. "000300")
 * @param {object} httpClient HttpClient 实例
 * @param {object} [opts] { days, secid, timeoutMs }
 * @returns {Promise<{ ok: boolean, series: Array<{date:string,value:number}>, reason: string|null }>}
 */
async function fetchIndexHistory(symbol, httpClient, opts = {}) {
  if (!/^\d{6}$/.test(String(symbol || ""))) {
    return { ok: false, series: [], reason: "invalid_symbol" };
  }
  const days = opts.days || INDEX_DEFAULT_DAYS;
  const secid = opts.secid || `${IDX_SECID_PREFIX}${symbol}`;
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0` +
    `&secid=${encodeURIComponent(secid)}&beg=0&end=20500101`;
  try {
    const r = await httpClient.get(url, {
      headers: { "User-Agent": IDX_UA, Referer: IDX_REF },
      timeout: opts.timeoutMs ?? 8000,
    });
    if (r.error === "network" || r.error === "timeout") {
      return { ok: false, series: [], reason: r.error };
    }
    if (r.status !== 200) {
      return { ok: false, series: [], reason: `HTTP ${r.status}` };
    }
    let series = parseIndexResponse(JSON.parse(r.body || "{}"));
    if (days && series.length > days) series = series.slice(-days);
    return { ok: true, series, reason: null };
  } catch (e) {
    return {
      ok: false,
      series: [],
      reason: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  parseLsjzResponse,
  fetchFundNavHistory,
  parseIndexResponse,
  fetchIndexHistory,
  INDEX_DEFAULT_DAYS,
};
