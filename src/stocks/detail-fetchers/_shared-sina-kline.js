/**
 * src/stocks/detail-fetchers/_shared-sina-kline.js
 *
 * Sina K-line fetcher + parser (公共模块, 阶段四 task 4+ 共用).
 * Task 5/9 也会 reuse.
 */
const SINA_KLINE_URL = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData";

async function fetchSinaKline(httpClient, code, limit) {
  const url = `${SINA_KLINE_URL}?symbol=${code}&scale=240&datalen=${limit}&ma=no`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseSinaKlines(body) {
  if (!Array.isArray(body)) return null;
  const out = [];
  for (const item of body) {
    if (!item || typeof item !== "object") return null;
    const o = Number(item.open), c = Number(item.close), h = Number(item.high), l = Number(item.low);
    if (!o || !c || !h || !l) return null;
    out.push({
      date: item.day || item.d,
      open: o, close: c, high: h, low: l,
      amount: Number(item.amount) || 0,
      turnover: Number(item.turnover) || 0,
      amplitude: ((h - l) / c) * 100,
    });
  }
  return out;
}

module.exports = { fetchSinaKline, parseSinaKlines };
