/**
 * src/main/ai-leaderboard/rate-limiter.js
 *
 * 限流层：
 *   - AA 令牌桶：1000/天（按 UTC 日重置）
 *   - 通用单飞（single-flight）：避免同 source 并发重复打外部 API
 *
 * 纯函数 + 模块级状态，便于单测（resetLimiter 可清状态）。
 */

const AA_DAILY_LIMIT = 1000;

let _aaUsed = 0;
let _aaDay = _utcDay();
const _inflight = new Map(); // source -> Promise（单飞）

function _utcDay(d) {
  const date = d || new Date();
  return date.toISOString().slice(0, 10);
}

function _resetIfNewDay() {
  const today = _utcDay();
  if (today !== _aaDay) {
    _aaDay = today;
    _aaUsed = 0;
  }
}

/**
 * 令牌桶获取（AA 1000/天）。
 * @param {string} source 'artificial-analysis' | 其它
 * @returns {boolean} true=放行
 */
function acquire(source) {
  if (source === "artificial-analysis") {
    _resetIfNewDay();
    if (_aaUsed >= AA_DAILY_LIMIT) return false;
    _aaUsed += 1;
    return true;
  }
  return true;
}

/**
 * 剩余令牌。
 * @param {string} source
 * @returns {number} Infinity 表示不限
 */
function remaining(source) {
  if (source === "artificial-analysis") {
    _resetIfNewDay();
    return Math.max(0, AA_DAILY_LIMIT - _aaUsed);
  }
  return Infinity;
}

/**
 * 单飞包装：同一 source 并发只跑一次底层 fn。
 * @param {string} source
 * @param {function():Promise<any>} fn
 * @returns {Promise<any>}
 */
async function singleFlight(source, fn) {
  const existing = _inflight.get(source);
  if (existing) return existing;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      _inflight.delete(source);
    }
  })();
  _inflight.set(source, p);
  return p;
}

/** 测试用：清状态。 */
function resetLimiter() {
  _aaUsed = 0;
  _aaDay = _utcDay();
  _inflight.clear();
}

module.exports = {
  AA_DAILY_LIMIT,
  acquire,
  remaining,
  singleFlight,
  resetLimiter,
};
