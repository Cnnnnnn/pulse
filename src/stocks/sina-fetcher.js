/**
 * src/stocks/sina-fetcher.js
 *
 * 新浪财经 A 股列表 (备用数据源).
 *
 * 数据源: https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData
 *   字段: code, name, trade (现价), pricechange, changepercent,
 *         per (PE 动态), pb, mktcap (总市值, **万元**), nmc (流通市值, 万元),
 *         turnoverratio (换手率%), volume, amount, open, high, low
 *   缺 ROE — 新浪不返 ROE 字段, 用 null 占位 (applyScreen 对 null 跳过该条件)
 *
 * 用途: 东财 push2.eastmoney.com 对 Node OpenSSL 客户端 RST 时, 自动 fallback 到此源.
 *   Sina 接口对 Node https 友好 (实测直接 200, 无 RST).
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const SINA_REFERER = "https://finance.sina.com.cn";

// 新浪单页最大条数 (实测 ~80, 设大点保险; 实测受 _s_r_a 参数影响, 但我们不用它)
const PAGE_SIZE = 80;
// ponytail: 全市场 ~5500 只, 翻 80 页兜底 (5500/80 ≈ 69)
const MAX_PAGES = 100;

/**
 * 构造 Sina 列表 URL. node=hs_a (沪深 A 股), num=页大小, page=页码 (1-based),
 * sort=changepercent (按涨跌幅), asc=0 (降序).
 */
function buildSinaUrl(page = 1, num = PAGE_SIZE) {
  const q = new URLSearchParams({
    node: "hs_a",
    num: String(num),
    page: String(page),
    sort: "changepercent",
    asc: "0",
    _s_r_a: "page",
  });
  return `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?${q.toString()}`;
}

/**
 * 解析 Sina 响应 — 它返回 JSON 数组 (有时被 var 包裹, 我们做 robust 处理).
 */
function parseSinaList(body) {
  if (typeof body !== "string" || body.length === 0) return [];
  let s = body.trim();
  // Sina 有时会包一层 var hqData_xxx=[]; 去掉
  if (s.startsWith("var ")) {
    const m = s.match(/=\s*([\s\S]*);?\s*$/);
    if (m) s = m[1];
  }
  let arr;
  try {
    arr = JSON.parse(s);
  } catch {
    return [];
  }
  return Array.isArray(arr) ? arr : [];
}

/** "-" / 非数 → null (跟 east-money 的 toNum 一致). */
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
 * 把新浪一条数据映射成 StockRow (跟 east-money mapRow 同形, 但 roe=null).
 *   Sina mktcap 单位是"万元", 我们的 row.marketCap 用"元", 故 ×10000.
 */
function mapSinaRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    code: toStr(raw.code),
    name: toStr(raw.name),
    price: toNum(raw.trade),
    changePct: toNum(raw.changepercent),
    turnover: toNum(raw.turnoverratio),
    pe: toNum(raw.per),
    pb: toNum(raw.pb),
    roe: null, // ponytail: Sina 不返 ROE, 筛选器对该条件 null 会自动跳过
    industry: null, // Sina 单页也不带行业, 用 null
    // marketCap: Sina 单位是"万元", 我们的 row 用"元", ×10000.
    // 直接对原始值 (string 或 number) ×10000, 不要再 toNum 两次.
    marketCap: toNum(
      raw.mktcap != null ? Number(raw.mktcap) * 10000 : null,
    ),
  };
}

/**
 * 拉全市场 A 股 (新浪备用源, 自动翻页).
 * @param {{get:(url,opts)=>Promise<{status:number,body:string,headers:object,error?:string}>}} httpClient
 * @param {{timeoutMs?:number, maxPages?:number}} [opts]
 */
async function fetchStocksSina(httpClient, opts = {}) {
  const fetchedAt = Date.now();
  const all = [];
  const maxPages = opts.maxPages ?? MAX_PAGES;
  try {
    for (let page = 1; page <= maxPages; page++) {
      const r = await httpClient.get(buildSinaUrl(page), {
        headers: { "User-Agent": UA, Referer: SINA_REFERER },
        timeout: opts.timeoutMs ?? 10000,
      });
      if (r.error) return { rows: all, fetchedAt, source: "sina", error: r.error };
      if (r.status !== 200) {
        return { rows: all, fetchedAt, source: "sina", error: `HTTP ${r.status}` };
      }
      const arr = parseSinaList(r.body);
      const rows = arr.map(mapSinaRow).filter((x) => x && x.code);
      all.push(...rows);
      // ponytail: 当页返空 / 不满 PAGE_SIZE → 末页, 停
      if (arr.length === 0 || arr.length < PAGE_SIZE) break;
    }
    return { rows: all, fetchedAt, source: "sina" };
  } catch (e) {
    return {
      rows: all,
      fetchedAt,
      source: "sina",
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  fetchStocksSina,
  mapSinaRow,
  parseSinaList,
  buildSinaUrl,
};