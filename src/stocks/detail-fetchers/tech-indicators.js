/**
 * src/stocks/detail-fetchers/tech-indicators.js
 *
 * tech_indicators angle fetcher. 东财优先, sina 备援; MA/MACD 客户端计算.
 */
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchTechIndicators(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary && primary.status === 200 && primary.body) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length >= 20) {
      return { ok: true, data: indicators(parsed.map((k) => k.close)) };
    }
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback && fallback.status === 200 && fallback.body) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length >= 20) {
      return { ok: true, data: indicators(parsed.map((k) => k.close)) };
    }
  }
  const primaryOk = primary && primary.status === 200 && primary.body;
  return {
    ok: false,
    reason: primaryOk ? "parse_failed" : "fetch_failed",
    error: "fetch error",
  };
}

function ma(arr, n) {
  if (arr.length < n) return 0;
  const slice = arr.slice(-n);
  return slice.reduce((s, x) => s + x, 0) / n;
}

function ema(arr, n) {
  if (arr.length < n) return 0;
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < arr.length; i += 1) e = arr[i] * k + e * (1 - k);
  return e;
}

function macdHist(closes) {
  if (closes.length < 26) return 0;
  const recent = [];
  for (let i = 25; i < closes.length; i += 1) {
    const sub = closes.slice(0, i + 1);
    recent.push(ema(sub, 12) - ema(sub, 26));
  }
  const macdLine = ema(closes, 12) - ema(closes, 26);
  const signal = ema(recent, 9);
  return macdLine - signal;
}

function indicators(closes) {
  return {
    ma5: ma(closes, 5),
    ma10: ma(closes, 10),
    ma20: ma(closes, 20),
    macdHist: macdHist(closes),
  };
}

module.exports = { fetchTechIndicators };
