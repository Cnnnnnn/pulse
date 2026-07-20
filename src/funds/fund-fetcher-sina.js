/**
 * src/funds/fund-fetcher-sina.js
 *
 * 新浪财经基金估值 (第二数据源, 与天天基金交叉比对).
 *   URL: http://hq.sinajs.cn/list=of{code}
 *   格式: var hq_str_of000001="名称,单位净值,累计净值,估算净值,估算涨跌%,净值日期";
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const SINA_REFERER = "https://finance.sina.com.cn";

/**
 * @param {string} body
 * @returns {{ name: string, nav: number, accNav: number, estimatedNav: number | null, dayChangePct: number, navDate: string } | null}
 */
function parseSinaFundLine(body) {
  if (typeof body !== "string" || !body.length) return null;
  const m = body.match(/="([^"]*)"/);
  if (!m || !m[1]) return null;
  const parts = m[1].split(",");
  if (parts.length < 6) return null;

  const nav = parseFloat(parts[1]);
  const accNav = parseFloat(parts[2]);
  const est = parseFloat(parts[3]);
  const dayChangePct = parseFloat(parts[4]);
  const navDate = String(parts[5] || "").trim();

  if (!Number.isFinite(nav) || nav <= 0) return null;

  return {
    name: parts[0] || "",
    nav,
    accNav: Number.isFinite(accNav) ? accNav : nav,
    estimatedNav: Number.isFinite(est) && est > 0 ? est : null,
    dayChangePct: Number.isFinite(dayChangePct) ? dayChangePct : 0,
    navDate,
  };
}

/**
 * @param {string} code
 * @param {{ get: (url, opts) => Promise<{status, body, error?}> }} httpClient
 * @param {{ timeoutMs?: number }} [opts]
 */
async function fetchFundNavSina(code, httpClient, opts = {}) {
  if (!/^\d{6}$/.test(String(code || ""))) {
    throw new Error(`invalid fund code: ${code}`);
  }
  const url = `http://hq.sinajs.cn/list=of${code}`;
  const r = await httpClient.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: SINA_REFERER,
    },
    timeout: opts.timeoutMs ?? 8000,
  });

  if (r.error === "network") throw new Error(`network error for ${code}`);
  if (r.error === "timeout") throw new Error(`timeout for ${code}`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${code}`);
  if (!r.body || !r.body.length) throw new Error(`empty body for ${code}`);

  const parsed = parseSinaFundLine(r.body);
  if (!parsed)
    throw new Error(`bad sina body for ${code}: ${r.body.slice(0, 80)}`);

  return {
    code,
    name: parsed.name,
    source: "sina",
    nav: parsed.nav,
    estimatedNav: parsed.estimatedNav,
    dayChangePct: parsed.dayChangePct,
    navDate: parsed.navDate,
  };
}

module.exports = { fetchFundNavSina, parseSinaFundLine };
