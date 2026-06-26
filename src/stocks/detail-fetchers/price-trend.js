/**
 * src/stocks/detail-fetchers/price-trend.js
 *
 * 阶段四 stub. Task 4 替换为真实实现 (东财 kline + sina fallback).
 */
async function fetchPriceTrend(_httpClient, { code: _code }) {
  return { ok: false, reason: "not_implemented", error: "stub" };
}
module.exports = { fetchPriceTrend };