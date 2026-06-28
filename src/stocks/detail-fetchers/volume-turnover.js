/**
 * src/stocks/detail-fetchers/volume-turnover.js
 *
 * volume_turnover angle fetcher. 东财 kline 优先, sina 备援.
 */
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchVolumeTurnover(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary && primary.status === 200 && primary.body) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length > 0)
      return { ok: true, data: summarize(parsed) };
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback && fallback.status === 200 && fallback.body) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length > 0)
      return { ok: true, data: summarize(parsed) };
  }
  const primaryOk = primary && primary.status === 200 && primary.body;
  return {
    ok: false,
    reason: primaryOk ? "parse_failed" : "fetch_failed",
    error: "fetch error",
  };
}

function summarize(klines) {
  const amounts = klines.map((k) => k.amount || 0);
  const turnovers = klines.map((k) => k.turnover || 0);
  return {
    avgAmount30d: avg(amounts),
    latestAmount: amounts[amounts.length - 1] || 0,
    avgTurnover30d: avg(turnovers),
    latestTurnover: turnovers[turnovers.length - 1] || 0,
  };
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

module.exports = { fetchVolumeTurnover };
