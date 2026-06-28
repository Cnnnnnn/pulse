/**
 * src/stocks/stock-detail-cache.js
 *
 * 数据缓存 key 计算. 角度顺序无关 — 同一组合任意顺序都返同一 key.
 *
 * CACHE_VERSION: bump 时所有老 cache 自动失效 (key 前缀变了). 当前 = 2.
 *   1 → 2 (2026-06-28): price-trend fetcher 多返 klines[] + lastQuote 字段 (K 线图 + Hero bar 用),
 *                        老缓存没这俩字段, 命中会渲染 undefined. bump 一次让下次访问直接重 fetch.
 */
const CACHE_VERSION = 2;

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
  return `${CACHE_VERSION}|detail|${code}|${sortedAngles.join(",")}`;
}

module.exports = { computeStockCacheKey, CACHE_VERSION };
