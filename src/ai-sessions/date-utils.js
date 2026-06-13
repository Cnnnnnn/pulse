/**
 * src/ai-sessions/date-utils.js
 *
 * YYYY-MM-DD ↔ 本地时区 epoch ms. detector.js 与 engine.js 共用.
 */

/**
 * 本地时区某天 0:00 的 epoch ms. 非法 dateKey → NaN.
 * @param {string} dateKey  'YYYY-MM-DD'
 * @param {number} now
 * @returns {number}
 */
function localDayStart(dateKey, now) {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m1) return NaN;
  const y = parseInt(m1[1], 10);
  const m = parseInt(m1[2], 10);
  const d = parseInt(m1[3], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return NaN;
  const probe = new Date(now);
  const localMinusUtcMs = -probe.getTimezoneOffset() * 60_000;
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return utcMidnight - localMinusUtcMs;
}

/** 同 localDayStart, 非法输入返 0 (engine 过滤用). */
function dateKeyToMs(dateKey, now) {
  const ms = localDayStart(dateKey, now);
  return Number.isFinite(ms) ? ms : 0;
}

module.exports = { localDayStart, dateKeyToMs };
