/**
 * src/stocks/detail-fetchers/_shared-sina-kline.js
 *
 * Sina K-line fetcher + parser (公共模块, 阶段四 task 4+ 共用).
 * Task 5/9 也会 reuse.
 */
const SINA_KLINE_URL =
  "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData";

async function fetchSinaKline(httpClient, code, limit) {
  // ponytail: sina API 需要 sh/sz 前缀, 裸 code 会返 null. sh=6xx, sz=其他.
  const market = code.startsWith("6") ? "sh" : "sz";
  const url = `${SINA_KLINE_URL}?symbol=${market}${code}&scale=240&datalen=${limit}&ma=no`;
  try {
    const res = await httpClient.get(url);
    if (res && typeof res.body === "string") {
      try {
        return { ...res, body: JSON.parse(res.body) };
      } catch (_) {
        return { ...res, body: null };
      }
    }
    return res;
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseSinaKlines(body) {
  if (!Array.isArray(body)) return null;
  const out = [];
  for (const item of body) {
    if (!item || typeof item !== "object") return null;
    const o = Number(item.open),
      c = Number(item.close),
      h = Number(item.high),
      l = Number(item.low);
    if (!o || !c || !h || !l) return null;
    // ponytail: sina v2 API 现在只返 day/open/high/low/close/volume,
    // amount/turnover 没有, 用 volume 做代理: amount ≈ volume 元 (粗估).
    out.push({
      date: item.day || item.d,
      open: o,
      close: c,
      high: h,
      low: l,
      amount: Number(item.volume) || 0,
      turnover: 0,
      amplitude: ((h - l) / c) * 100,
    });
  }
  return out;
}

module.exports = { fetchSinaKline, parseSinaKlines };
