/**
 * src/stocks/detail-fetchers/valuation.js
 *
 * 阶段四 stub. Task 6 替换为真实实现 (东财估值指标).
 */
async function fetchValuation(_httpClient, { code: _code }) {
  return { ok: false, reason: "not_implemented", error: "stub" };
}
module.exports = { fetchValuation };