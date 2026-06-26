/**
 * src/stocks/detail-fetchers/volume-turnover.js
 *
 * 阶段四 stub. Task 5 替换为真实实现 (东财 kline 成交额 + 换手率).
 */
async function fetchVolumeTurnover(_httpClient, { code: _code }) {
  return { ok: false, reason: "not_implemented", error: "stub" };
}
module.exports = { fetchVolumeTurnover };