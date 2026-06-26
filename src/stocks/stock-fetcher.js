/**
 * src/stocks/stock-fetcher.js
 *
 * 拉全市场 A 股行情 + 基本面 (东财 clist 接口). 对照 spec §5.2.
 * 跟 fund-fetcher.js 同套路: 纯包装 HttpClient, 无业务副作用.
 *
 * 数据源: https://push2.eastmoney.com/api/qt/clist/get
 *   硬限制单页 ≤100 条, 拉全市场 ~5500 只必须翻 ~56 页. sortKey → fid
 *   下推给东财, 让东财先按该维度排好, 我们翻页取全量再做筛选.
 *
 * ponytail: 东财 push2 在某些网络环境对 Node OpenSSL 客户端 RST (反爬).
 *   自动 fallback 到 sina-fetcher, 字段差异只是缺 ROE — filter 对 null 自动跳过.
 */
const {
  MARKET_PARAM,
  FIELD_MAP,
  FIELDS_PARAM,
  SORT_KEY_TO_FID,
  DEFAULT_FID,
} = require("./stock-constants");
const { fetchStocksSina } = require("./sina-fetcher");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// 东财 clist 强制单页 ≤100 条. pz 传 100 拿满一页.
const PAGE_SIZE = 100;

/**
 * 构造 clist 请求 URL. sortKey 决定东财端排序 (fid), pn 决定页码.
 * @param {string} [sortKey]  我们的 key (roe/pe/pb/...), 未知则用默认 fid
 * @param {number} [pn=1]     页码 (1-based), 每页 ≤100 条
 */
function buildUrl(sortKey, pn = 1) {
  const fid =
    (sortKey && SORT_KEY_TO_FID[sortKey]) || DEFAULT_FID;
  const q = new URLSearchParams({
    pn: String(pn),
    pz: String(PAGE_SIZE),
    po: "1", // 降序
    np: "1",
    fltt: "2",
    invt: "2",
    fields: FIELDS_PARAM,
    fid,
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
 * 拉全市场 A 股 (东财 clist, 自动翻页).
 * 按当前排序维度 (sortKey) 让东财排好返回, 翻页取全 (避免 top-100 选股失真).
 * 东财失败时自动 fallback 到 sina-fetcher (无 ROE 字段, 但有 PE/PB/市值).
 *
 * @param {{get:(url,opts)=>Promise<{status:number,body:string,headers:object,error?:string}>}} httpClient
 * @param {{timeoutMs?:number, sortKey?:string, maxPages?:number, fallbackToSina?:boolean}} [opts]
 * @returns {Promise<{rows:object[], total:number, fetchedAt:number, error?:string, source?:string}>}
 */
async function fetchStocks(httpClient, opts = {}) {
  const fallbackToSina = opts.fallbackToSina !== false; // 默认开启
  const fetchedAt = Date.now();
  const all = [];
  let total = 0;
  // ponytail: 东财硬限制单页 ≤100, 拉全市场必须翻页. maxPages 上限防接口"total"异常导致死循环.
  const maxPages = opts.maxPages ?? 60; // 60*100=6000, 覆盖全市场 5534 + 缓冲
  let primaryError = null;
  try {
    for (let pn = 1; pn <= maxPages; pn++) {
      const r = await httpClient.get(buildUrl(opts.sortKey, pn), {
        headers: { "User-Agent": UA },
        timeout: opts.timeoutMs ?? 10000,
      });
      if (r.error) {
        primaryError = r.error;
        break;
      }
      if (r.status !== 200) {
        primaryError = `HTTP ${r.status}`;
        break;
      }
      const { total: t, diff } = parseClist(r.body);
      if (pn === 1) total = t;
      const pageRows = diff.map(mapRow).filter((x) => x && x.code);
      all.push(...pageRows);
      // 翻页停止条件: 当页返空, 或已覆盖 total
      if (pageRows.length === 0 || all.length >= total) break;
      // 兜底: 当页不足 100 (末页), 再翻一次确认空, 然后停
      if (pageRows.length < PAGE_SIZE) break;
    }
    if (primaryError && all.length === 0 && fallbackToSina) {
      // ponytail: 东财整页失败 → fallback 新浪. 跨文件调用, 同样的 httpClient 接口.
      const sina = await fetchStocksSina(httpClient, { timeoutMs: opts.timeoutMs, maxPages: 70 });
      if (!sina.error && sina.rows.length > 0) {
        return { rows: sina.rows, total: sina.rows.length, fetchedAt, source: sina.source };
      }
      // 两条都失败
      return {
        rows: [],
        total: 0,
        fetchedAt,
        error: `东财: ${primaryError}; 新浪: ${sina.error || "空"}`,
      };
    }
    if (primaryError) {
      return { rows: all, total, fetchedAt, error: primaryError };
    }
    return { rows: all, total, fetchedAt };
  } catch (e) {
    return {
      rows: all,
      total,
      fetchedAt,
      error: e && e.message ? e.message : String(e),
    };
  }
}

/**
 * A 股代码 → 东财 secid ("1.600519" 沪 / "0.000001" 深).
 * 6 开头 = 沪市 (含科创板 688), 0/3 开头 = 深市 (含创业板 300).
 * @param {string} code 6 位代码
 * @returns {string|null}
 */
function codeToSecid(code) {
  const c = String(code || "").trim();
  if (!/^\d{6}$/.test(c)) return null;
  if (c.startsWith("6")) return `1.${c}`;
  if (c.startsWith("0") || c.startsWith("3")) return `0.${c}`;
  return null;
}

/**
 * 按指定代码批量拉行情 (自选股用). 走东财 ulist.np 接口.
 * @param {string[]} codes 6 位 A 股代码
 * @param {object} httpClient
 * @param {{timeoutMs?:number}} [opts]
 * @returns {Promise<{rows:object[], fetchedAt:number, error?:string}>}
 */
async function fetchStocksByCodes(codes, httpClient, opts = {}) {
  const list = (Array.isArray(codes) ? codes : [])
    .map(codeToSecid)
    .filter(Boolean);
  if (list.length === 0) return { rows: [], fetchedAt: Date.now() };
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=${FIELDS_PARAM}&secids=${list.join(",")}`;
  try {
    const r = await httpClient.get(url, {
      headers: { "User-Agent": UA },
      timeout: opts.timeoutMs ?? 10000,
    });
    if (r.error) return { rows: [], fetchedAt: Date.now(), error: r.error };
    if (r.status !== 200)
      return { rows: [], fetchedAt: Date.now(), error: `HTTP ${r.status}` };
    const { diff } = parseClist(r.body);
    const rows = diff.map(mapRow).filter((x) => x && x.code);
    return { rows, fetchedAt: Date.now() };
  } catch (e) {
    return {
      rows: [],
      fetchedAt: Date.now(),
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  fetchStocks,
  fetchStocksByCodes,
  parseClist,
  mapRow,
  buildUrl,
  codeToSecid,
};
