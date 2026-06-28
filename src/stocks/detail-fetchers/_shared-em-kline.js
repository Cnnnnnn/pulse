/**
 * src/stocks/detail-fetchers/_shared-em-kline.js
 *
 * Eastmoney K-line fetcher + parser (公共模块, 阶段四 task 4+ 共用).
 * Task 5/9 也会 reuse.
 */
const EASTMONEY_KLINE_URL =
  "https://push2his.eastmoney.com/api/qt/stock/kline/get";

async function fetchEastmoneyKline(httpClient, code, limit) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  // ponytail: 用 beg+end 限定 90 天窗口, 不用 0/20500101. 拉全历史会触发 em 服务端前复权计算,
  // 返回 8000+ 行 + 极慢 (timeout). lmt 也会被服务端忽略 → 用时间窗自己截断.
  const endDate = formatYmd(new Date());
  const startDate = formatYmd(new Date(Date.now() - 90 * 86400 * 1000));
  const url = `${EASTMONEY_KLINE_URL}?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=${startDate}&end=${endDate}&lmt=${limit}`;
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

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseEastmoneyKlines(body) {
  if (!body || !body.data || !Array.isArray(body.data.klines)) return null;
  const out = [];
  for (const line of body.data.klines) {
    const parts = String(line).split(",");
    if (parts.length < 6) return null;
    const [date, open, close, high, low, volume, amount, turnover] = parts;
    const o = Number(open),
      c = Number(close),
      h = Number(high),
      l = Number(low);
    if (!o || !c || !h || !l) return null;
    out.push({
      date,
      open: o,
      close: c,
      high: h,
      low: l,
      amount: Number(amount) || 0,
      turnover: Number(turnover) || 0,
      amplitude: ((h - l) / c) * 100,
    });
  }
  return out;
}

module.exports = { fetchEastmoneyKline, parseEastmoneyKlines };
