/**
 * src/stocks/detail-fetchers/_shared-f10.js
 *
 * Eastmoney F10 主要指标 fetcher (公共模块, 阶段四 task 6+ 共用).
 */
const F10_URL = "https://push2his.eastmoney.com/api/qt/stock/get";

export async function fetchEastmoneyF10(httpClient: any, code: any) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const url = `${F10_URL}?secid=${secid}&fields=f57,f58,f59,f60,f116,f117,f37,f22,f24`;
  try {
    const res = await httpClient.get(url);
    if (res && typeof res.body === "string") {
      try {
        return { ...res, body: JSON.parse(res.body) };
      } catch (_: any) {
        return { ...res, body: null };
      }
    }
    return res;
  } catch (e: any) {
    return { ok: false, status: 0, error: e.message };
  }
}

module.exports = { fetchEastmoneyF10 };
