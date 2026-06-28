/**
 * src/stocks/detail-fetchers/price-trend.js
 *
 * price_trend angle fetcher. 东财优先, sina 备援.
 */
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchPriceTrend(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary && primary.status === 200 && primary.body) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length > 0) {
      return { ok: true, data: summarize(parsed) };
    }
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback && fallback.status === 200 && fallback.body) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length > 0) {
      return { ok: true, data: summarize(parsed) };
    }
  }
  const primaryOk = primary && primary.status === 200 && primary.body;
  return {
    ok: false,
    reason: primaryOk ? "parse_failed" : "fetch_failed",
    error: "fetch error",
  };
}

function summarize(klines) {
  const closes = klines.map((k) => k.close);
  return {
    closes,
    change5d: pctChange(closes, 5),
    change20d: pctChange(closes, 20),
    amplitude: avg(klines.map((k) => k.amplitude)),
  };
}

function pctChange(closes, n) {
  if (closes.length < n + 1) return 0;
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 1 - n];
  if (!past) return 0;
  return ((last - past) / past) * 100;
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

module.exports = { fetchPriceTrend };
