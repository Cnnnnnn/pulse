/**
 * src/stocks/detail-fetchers/profitability.js
 *
 * profitability angle fetcher. 东财 F10 优先, sina 备援.
 */
const f10 = require("./_shared-f10");
const fb = require("./_shared-profitability-fallback");

async function fetchProfitability(httpClient, { code }) {
  const primary = await f10.fetchEastmoneyF10(httpClient, code);
  if (primary.ok) {
    const out = parseF10(primary.body);
    if (out) return { ok: true, data: out };
  }
  const fallback = await fb.fetchSinaProfitability(httpClient, code);
  if (fallback.ok) {
    const out = fb.parseSinaProfitability(fallback.body);
    if (out) return { ok: true, data: out };
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function parseF10(body) {
  if (!body || !body.data) return null;
  const d = body.data;
  const roe = Number(d.f37);
  if (!roe) return null;
  return {
    roe,
    grossMargin: Number(d.f22) || null,
    netMargin: Number(d.f24) || null,
    reportDate: d.reportDate || "unknown",
  };
}

module.exports = { fetchProfitability };