/**
 * src/stocks/detail-fetchers/_shared-profitability-fallback.js
 *
 * Sina 盈利能力指标备援 fetcher (HTML 文本解析).
 */
const SINA_URL = "https://money.finance.sina.com.cn/corp/go.php/vFD_FinancialGuideLine/stockid/";

async function fetchSinaProfitability(httpClient, code) {
  const url = `${SINA_URL}${code}/ctrl/part/displaytype/4.phtml`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseSinaProfitability(text) {
  if (!text || typeof text !== "string") return null;
  const roeMatch = text.match(/ROE\s*=\s*([\d.]+)/i);
  if (!roeMatch) return null;
  const grossMatch = text.match(/GP\s*=\s*([\d.]+)/i);
  const netMatch = text.match(/NM\s*=\s*([\d.]+)/i);
  return {
    roe: Number(roeMatch[1]),
    grossMargin: grossMatch ? Number(grossMatch[1]) : null,
    netMargin: netMatch ? Number(netMatch[1]) : null,
    reportDate: "unknown",
  };
}

module.exports = { fetchSinaProfitability, parseSinaProfitability };