/**
 * src/stocks/detail-fetchers/peer-compare.js
 *
 * peer_compare angle fetcher. 复用 valuation 拿 PE/PB,
 * 走东财 datacenter 拉行业 PE/PB 中位数 + 这只的排名 + industry 名, 算偏差百分比.
 * industry 从 datacenter response 的 INDUSTRY_NAME 拿 (valuation 不返 industry).
 *
 * ponytail: 不重拉 PE/PB — valuation 已有, 复用. datacenter 接口跟
 *   现有 valuation.js 用同一个 host (datacenter-web.eastmoney.com), UA 一致.
 */
const { fetchValuation } = require("./valuation");

const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
// INDUSTRY_NAME: 行业中文名, SECURITY_CODE: 股票 code, PE_TTM_MEDIAN / PB_MQR_MEDIAN: 行业中位,
// PE_TTM_RANK / PB_MQR_RANK: 这只在行业里的排名 (1 = 最便宜), TOTAL: 行业总股票数
const COLUMNS = "SECUCODE,INDUSTRY_NAME,PE_TTM,PE_TTM_MEDIAN,PE_TTM_RANK,PB_MQR,PB_MQR_MEDIAN,PB_MQR_RANK,TOTAL";
const PEER_TIMEOUT_MS = 8000;

async function fetchPeerCompare(httpClient, { code }) {
  // 1) 复用 valuation 拿 PE/PB (industry 不从这里拿, valuation 不返 industry)
  const val = await fetchValuation(httpClient, { code });
  if (!val || !val.ok) return { ok: false, reason: "no_industry_data", error: "valuation 失败" };
  const { pe, pb } = val.data || {};

  // 2) datacenter 拉行业均值 + industry 名
  // industry 是中文名, datacenter filter 需要 INDUSTRY_CODE. 我们用 SECURITY_CODE + 行业代码
  // 走 PEER_QUERY 的 filter 用 (SECUCODE="<code>.<exchange>"), 让 datacenter 内部 join 行业.
  // industry 名从 response 的 INDUSTRY_NAME 字段拿.
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const url = `${DATACENTER_URL}?reportName=RPT_PCF10_INDUSTRY_EVALUATION&columns=${COLUMNS}&filter=${filter}&pageNumber=1&pageSize=1&source=F10&client=PC`;

  let res;
  try {
    res = await httpClient.get(url, { timeout: PEER_TIMEOUT_MS });
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: e && e.message };
  }
  if (!res || res.status !== 200 || !res.body) {
    return { ok: false, reason: "fetch_failed", error: "datacenter 非 200" };
  }
  const body = typeof res.body === "string" ? safeJson(res.body) : res.body;
  const rows = body && body.result && Array.isArray(body.result.data) ? body.result.data : null;
  if (!rows || rows.length === 0) return { ok: false, reason: "no_industry_data", error: "datacenter result.data 为空" };

  const row = rows[0];
  const industry = row.INDUSTRY_NAME;
  if (!industry) return { ok: false, reason: "no_industry_data", error: "datacenter row 缺 INDUSTRY_NAME" };
  const peMedian = num(row.PE_TTM_MEDIAN);
  const pbMedian = num(row.PB_MQR_MEDIAN);
  const total = num(row.TOTAL);

  return {
    ok: true,
    data: {
      industry,
      pe,
      peIndustryMedian: peMedian,
      peRank: num(row.PE_TTM_RANK),
      peTotal: total,
      peDeviationPct: deviationPct(pe, peMedian),
      pb,
      pbIndustryMedian: pbMedian,
      pbRank: num(row.PB_MQR_RANK),
      pbTotal: total,
      pbDeviationPct: deviationPct(pb, pbMedian),
    },
  };
}

function deviationPct(thisVal, median) {
  if (thisVal == null || median == null || median === 0) return 0;
  return ((thisVal - median) / median) * 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = { fetchPeerCompare };
