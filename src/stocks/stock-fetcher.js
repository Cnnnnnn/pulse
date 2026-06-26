/**
 * src/stocks/stock-fetcher.js
 *
 * 拉全市场 A 股行情 + 基本面 (东财 clist 接口). 对照 spec §5.2.
 * 跟 fund-fetcher.js 同套路: 纯包装 HttpClient, 无业务副作用.
 *
 * 数据源: https://push2.eastmoney.com/api/qt/clist/get
 *   一个请求返回全市场 (~5000 只) 全字段.
 */
const { MARKET_PARAM, FIELD_MAP, FIELDS_PARAM } = require("./stock-constants");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function buildUrl() {
  const q = new URLSearchParams({
    pn: "1",
    pz: "5000",
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fields: FIELDS_PARAM,
    fs: MARKET_PARAM,
  });
  return `https://push2.eastmoney.com/api/qt/clist/get?${q.toString()}`;
}

/**
 * 解析东财 clist 响应体, 抽出 data.diff 数组.
 * @param {string} body
 * @returns {{total:number, diff:object[]}}
 */
function parseClist(body) {
  if (typeof body !== "string" || body.length === 0) {
    return { total: 0, diff: [] };
  }
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return { total: 0, diff: [] };
  }
  const data = j && j.data;
  if (!data || typeof data !== "object") return { total: 0, diff: [] };
  const diff = Array.isArray(data.diff) ? data.diff : [];
  const total = typeof data.total === "number" ? data.total : diff.length;
  return { total, diff };
}

/** 东财 "-" 表示无数据 → null. 其它 number 字段 NaN → null. */
function toNum(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "-" || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * 把东财一条 diff 映射成 StockRow.
 * @returns {{code,name,price,changePct,turnover,pe,pb,roe,industry,marketCap}|null}
 */
function mapRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const g = (f) => raw[f];
  return {
    code: toStr(g(FIELD_MAP.code)),
    name: toStr(g(FIELD_MAP.name)),
    price: toNum(g(FIELD_MAP.price)),
    changePct: toNum(g(FIELD_MAP.changePct)),
    turnover: toNum(g(FIELD_MAP.turnover)),
    pe: toNum(g(FIELD_MAP.pe)),
    pb: toNum(g(FIELD_MAP.pb)),
    roe: toNum(g(FIELD_MAP.roe)),
    industry: toStr(g(FIELD_MAP.industry)),
    marketCap: toNum(g(FIELD_MAP.marketCap)),
  };
}

/**
 * 拉全市场 A 股.
 * @param {{get:(url,opts)=>Promise<{status:number,body:string,headers:object,error?:string}>}} httpClient
 * @param {{timeoutMs?:number}} [opts]
 * @returns {Promise<{rows:object[], total:number, fetchedAt:number, error?:string}>}
 */
async function fetchStocks(httpClient, opts = {}) {
  try {
    const r = await httpClient.get(buildUrl(), {
      headers: { "User-Agent": UA },
      timeout: opts.timeoutMs ?? 8000,
    });
    if (r.error) {
      return { rows: [], total: 0, fetchedAt: Date.now(), error: r.error };
    }
    if (r.status !== 200) {
      return { rows: [], total: 0, fetchedAt: Date.now(), error: `HTTP ${r.status}` };
    }
    const { total, diff } = parseClist(r.body);
    const rows = diff.map(mapRow).filter((x) => x && x.code);
    return { rows, total, fetchedAt: Date.now() };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      fetchedAt: Date.now(),
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = { fetchStocks, parseClist, mapRow, buildUrl };
