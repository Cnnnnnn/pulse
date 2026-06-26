/**
 * src/stocks/detail-fetchers/capital-flow.js
 *
 * 阶段四 stub. Task 8 替换为真实实现 (东财主力资金流向).
 */
async function fetchCapitalFlow(_httpClient, { code: _code }) {
  return { ok: false, reason: "not_implemented", error: "stub" };
}
module.exports = { fetchCapitalFlow };