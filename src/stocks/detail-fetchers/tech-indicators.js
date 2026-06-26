/**
 * src/stocks/detail-fetchers/tech-indicators.js
 *
 * 阶段四 stub. Task 9 替换为真实实现 (本地计算 MA/MACD).
 */
async function fetchTechIndicators(_httpClient, { code: _code }) {
  return { ok: false, reason: "not_implemented", error: "stub" };
}
module.exports = { fetchTechIndicators };