/**
 * src/funds/fund-search.js
 *
 * 天天基金关键字搜索 —— 拉 + 解析 + 过滤 + 字段映射.
 *
 * 数据源: fundsuggest.eastmoney.com (东方财富)
 *   URL: http://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx
 *   参数: ?key=KEY&m=1&pageindex=1&pagesize=20
 *   返回: JSON { ErrCode, Datas: [{ CODE, NAME, CATEGORYDESC, FundBaseInfo?: {...} }, ...] }
 *
 * 过滤规则:
 *   - 只返回 CATEGORYDESC === '基金' 的 (排除股票/港股/美股)
 *   - FundBaseInfo 存在 → 优先 (有 FTYPE/JJGS/NAVURL)
 *   - FTYPE / FUNDTYPE 用于 UI 分类提示
 *
 * v1.0 (2026-06-12) — 初版
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const SEARCH_URL = 'http://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx';

/**
 * @typedef {{
 *   code: string,         // 6 位代码
 *   name: string,         // 主名 (NAME)
 *   shortName: string,    // 简称 (SHORTNAME 或 NAME)
 *   ftype: string,        // 类型描述 (e.g. "混合型-灵活")
 *   fundType: string,     // 类型编码 (e.g. "002")
 *   company: string,      // 基金公司
 *   latestNav: number|null,  // 最新单位净值 (DWJZ)
 *   navDate: string|null,    // 净值日期 (FSRQ)
 * }} FundSearchResult
 */

/**
 * 搜索基金
 *
 * @param {string} query        关键字 (>= 2 字符才发请求, 否则返空)
 * @param {{ get: (url, opts) => Promise<{status, body, headers, error?}> }} httpClient
 * @param {{ timeoutMs?: number, pagesize?: number }} [opts]
 * @returns {Promise<FundSearchResult[]>}
 */
async function searchFunds(query, httpClient, opts = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    key: q,
    m: '1',
    pageindex: '1',
    pagesize: String(opts.pagesize ?? 20),
  });
  const url = `${SEARCH_URL}?${params.toString()}`;

  const r = await httpClient.get(url, {
    headers: { 'User-Agent': UA },
    timeout: opts.timeoutMs ?? 6000,
  });
  if (r.error === 'network') throw new Error('network error');
  if (r.error === 'timeout') throw new Error('timeout');
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  if (!r.body || !r.body.length) return [];

  return parseSearchResponse(r.body);
}

/**
 * 解析 + 过滤 + 字段映射. 纯函数, 可单测.
 *
 * @param {string} body  原始 JSON 字符串
 * @returns {FundSearchResult[]}
 */
function parseSearchResponse(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  if (!json || json.ErrCode !== 0) return [];
  const arr = Array.isArray(json.Datas) ? json.Datas : [];

  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    // 过滤: 只要 CATEGORYDESC === '基金'
    if (item.CATEGORYDESC !== '基金') continue;
    const code = String(item.CODE || '').trim();
    if (!/^\d{6}$/.test(code)) continue;

    const fb = item.FundBaseInfo || null;
    out.push({
      code,
      name: String(item.NAME || fb && fb.SHORTNAME || `基金 ${code}`),
      shortName: String((fb && fb.SHORTNAME) || item.NAME || '').trim(),
      ftype: (fb && fb.FTYPE) || '',
      fundType: (fb && fb.FUNDTYPE) || '',
      company: (fb && fb.JJGS) || '',
      latestNav: (() => {
        if (!fb || !fb.DWJZ) return null;
        const n = parseFloat(fb.DWJZ);
        return Number.isFinite(n) ? n : null;
      })(),
      navDate: (fb && fb.FSRQ) || null,
    });
  }
  return out;
}

module.exports = { searchFunds, parseSearchResponse, SEARCH_URL };