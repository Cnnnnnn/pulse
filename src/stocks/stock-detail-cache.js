/**
 * src/stocks/stock-detail-cache.js
 *
 * 数据缓存 key 计算. 角度顺序无关 — 同一组合任意顺序都返同一 key.
 */

/**
 * @param {string} code  股票代码 (e.g. "600519")
 * @param {string[]} angles  角度 key 数组
 * @returns {string} 缓存 key
 */
function computeStockCacheKey(code, angles) {
  if (!code || !Array.isArray(angles) || angles.length === 0) {
    return null;
  }
  const sortedAngles = [...angles].sort();
  return `detail|${code}|${sortedAngles.join(",")}`;
}

module.exports = { computeStockCacheKey };
