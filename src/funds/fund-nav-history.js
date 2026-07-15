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
  // 2026-07-15: 东财 lsjz 硬上限 pageSize=20; pageSize≥250 直接 Data:null
  //   实测: pageSize=30..200 也只回 20 条; 必须 pageIndex 分页才能拿 3M/1Y
  //   ponytail: 之前把 days 当 pageSize 传, 切 1Y 反而拿空再回退到 20 条短缓存
  const days = Math.max(1, Number(opts.days) || 365);
  const PAGE = 20;
  const maxPages = Math.min(Math.ceil(days / PAGE), 100); // 上限 2000 交易日
  const byDate = new Map();
  let totalCount = null;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=${page}&pageSize=${PAGE}`;
      const r = await httpClient.get(url, {
        headers: { "User-Agent": UA, Referer: REF },
        timeout: opts.timeoutMs ?? 8000,
      });
      if (r.error === "network" || r.error === "timeout") {
        if (byDate.size) break;
        return { ok: false, series: [], reason: r.error };
      }
      if (r.status !== 200) {
        if (byDate.size) break;
        return { ok: false, series: [], reason: `HTTP ${r.status}` };
      }
      let json;
      try {
        json = JSON.parse(r.body || "{}");
      } catch (e) {
        if (byDate.size) break;
        return {
          ok: false,
          series: [],
          reason: e && e.message ? e.message : String(e),
        };
      }
      if (typeof json.TotalCount === "number" && json.TotalCount > 0) {
        totalCount = json.TotalCount;
      }
      const list =
        json && json.Data && Array.isArray(json.Data.LSJZList)
          ? json.Data.LSJZList
          : null;
      if (!list || !list.length) {
        if (page === 1) return { ok: false, series: [], reason: "empty_response" };
        break;
      }
      for (const row of list) {
        const nav = parseFloat(row.DWJZ);
        if (!row.FSRQ || !Number.isFinite(nav)) continue;
        byDate.set(String(row.FSRQ), nav);
      }
      if (byDate.size >= days) break;
      if (totalCount != null && page * PAGE >= totalCount) break;
      if (list.length < PAGE) break;
    }
    const series = [...byDate.entries()]
      .map(([date, nav]) => ({ date, nav }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const trimmed = series.length > days ? series.slice(-days) : series;
    return { ok: true, series: trimmed, reason: null };
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
