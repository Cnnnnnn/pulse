/**
 * src/stocks/detail-fetchers/valuation.js
 *
 * valuation angle fetcher. 东财 F10 优先, 腾讯 qt.gtimg.cn 备援.
 */
const f10 = require("./_shared-f10");

const TENCENT_URL = "http://qt.gtimg.cn/q=";

async function fetchValuation(httpClient, { code }) {
  const primary = await f10.fetchEastmoneyF10(httpClient, code);
  if (primary.ok) {
    const out = parseF10(primary.body);
    if (out) return { ok: true, data: out };
  }
  const fallback = await fetchTencentQuote(httpClient, code);
  if (fallback.ok) {
    const out = parseTencent(fallback.body);
    if (out) return { ok: true, data: out };
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function parseF10(body) {
  if (!body || !body.data) return null;
  const d = body.data;
  const eps = Number(d.f57);
  const bvps = Number(d.f59);
  const totalShare = Number(d.f60);
  const totalCap = Number(d.f116);
  if (!eps || !bvps || !totalShare) return null;
  const price = totalCap / totalShare;
  return { pe: price / eps, pb: price / bvps, pePercentile3y: null };
}

async function fetchTencentQuote(httpClient, code) {
  const market = code.startsWith("6") ? "sh" : "sz";
  const url = `${TENCENT_URL}${market}${code}`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseTencent(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].split(",");
  if (parts.length < 50) return null;
  const pe = Number(parts[39]);
  const eps = Number(parts[44]);
  const bvps = Number(parts[45]);
  if (!pe || !eps || !bvps) return null;
  return { pe, pb: (pe * eps) / bvps, pePercentile3y: null };
}

module.exports = { fetchValuation };
