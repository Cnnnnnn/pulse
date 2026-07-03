/**
 * src/stocks/detail-fetchers/peer-compare.js
 *
 * peer_compare angle fetcher.
 *   - 复用 valuation 拿本股 PE/PB
 *   - RPT_VALUATIONSTATUS 拿 PE/PB 历史分位 (INDEX_PERCENTILE) + 估值状态 (VALATION_STATUS)
 *   - fetchIndustryPeers (RPT_LICO_FN_CPD) 拿行业成员 → 客户端算 ROE/毛利率中位
 *
 * ponytail: 旧的 RPT_PCF10_INDUSTRY_EVALUATION 报表已下线, 行业 PE/PB 中位拿不到了.
 *   LICO_FN_CPD 没有 PE/PB 字段, 所以 PE/PB 维度改用历史分位 (比"行业中位偏差"更有
 *   信息量 — PE 处历史 X% 分位). 行业 ROE/毛利率中位从 peers 客户端算.
 *
 * 返回 { ok, data } 或 { ok:false, reason, error }.
 * data = {
 *   industry,
 *   pe, pePercentile, peValuationStatus,
 *   pb, pbPercentile, pbValuationStatus,
 *   roeIndustryMedian, grossMarginIndustryMedian,
 * }
 */
const { fetchValuation } = require("./valuation");
const { fetchIndustryPeers } = require("./_shared-industry");

const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const PEER_TIMEOUT_MS = 8000;

async function fetchPeerCompare(httpClient, { code }) {
  // 1) 复用 valuation 拿 PE/PB
  const val = await fetchValuation(httpClient, { code });
  if (!val || !val.ok) return { ok: false, reason: "no_industry_data", error: "valuation 失败" };
  const { pe, pb } = val.data || {};

  // 2) RPT_VALUATIONSTATUS 拿 PE/PB 历史分位 (并行)
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const valuationRes = await fetchValuationStatus(httpClient, secucode);

  // 3) fetchIndustryPeers 拿行业成员 → 算 ROE/毛利率中位
  const peers = await fetchIndustryPeers(httpClient, code);
  if (!peers.ok) return { ok: false, reason: peers.reason, error: peers.error };

  const roeValues = peers.data.peers.map((p) => p.roe).filter((v) => v != null);
  const grossValues = peers.data.peers.map((p) => p.grossMargin).filter((v) => v != null);

  const peStatus = valuationRes.pe;
  const pbStatus = valuationRes.pb;

  return {
    ok: true,
    data: {
      industry: peers.data.industry,
      pe,
      pePercentile: peStatus ? peStatus.percentile : null,
      peValuationStatus: peStatus ? peStatus.status : null,
      pb,
      pbPercentile: pbStatus ? pbStatus.percentile : null,
      pbValuationStatus: pbStatus ? pbStatus.status : null,
      roeIndustryMedian: median(roeValues),
      grossMarginIndustryMedian: median(grossValues),
    },
  };
}

// RPT_VALUATIONSTATUS: type=1 是 PE_TTM, type=2 是 PB.
// 每条返回 INDEX_VALUE (当前值) + INDEX_PERCENTILE (历史分位 0-100) + VALATION_STATUS (中文状态).
// columns=ALL 一次拿多条, 客户端按 type 分.
async function fetchValuationStatus(httpClient, secucode) {
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const url =
    `${DATACENTER_URL}?reportName=RPT_VALUATIONSTATUS` +
    `&columns=ALL&filter=${filter}&pageSize=10&source=HSF10&client=PC`;

  let res;
  try {
    res = await httpClient.get(url, { timeout: PEER_TIMEOUT_MS });
  } catch (e) {
    return { pe: null, pb: null };
  }
  if (!res || res.status !== 200 || !res.body) return { pe: null, pb: null };

  const body = typeof res.body === "string" ? safeJson(res.body) : res.body;
  const rows =
    body && body.result && Array.isArray(body.result.data) ? body.result.data : [];

  const pe = rows.find((r) => Number(r.TYPE) === 1);
  const pb = rows.find((r) => Number(r.TYPE) === 2);
  return {
    pe: pe ? { percentile: num(pe.INDEX_PERCENTILE), status: pe.VALATION_STATUS || null } : null,
    pb: pb ? { percentile: num(pb.INDEX_PERCENTILE), status: pb.VALATION_STATUS || null } : null,
  };
}

// 中位数 (数值数组). 空数组返 null.
function median(arr) {
  const sorted = arr.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = { fetchPeerCompare };
