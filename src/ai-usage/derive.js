/**
 * src/ai-usage/derive.js
 *
 * Pure functions: 从 (current snapshot, previous snapshot) 派生消耗速率和耗尽时间.
 * 用于 "按当前速度 Xh 后用完" UI 提示.
 *
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §3.2.2
 */

const MAX_BLOW_UP_HOURS = 24; // > 24h 视为速率太低/数据异常, 不显示

/**
 * 计算每小时消耗速率 (units per hour).
 * @param {{used: number|null, fetchedAt: number}} cur
 * @param {{used: number|null, fetchedAt: number}|null} prev
 * @returns {number|null} units per hour, 2 位小数; 输入不合法返 null
 */
function computeBurnRate(cur, prev) {
  if (!cur || !prev) return null;
  if (typeof cur.used !== 'number' || typeof prev.used !== 'number') return null;
  if (typeof cur.fetchedAt !== 'number' || typeof prev.fetchedAt !== 'number') return null;

  const dtMs = cur.fetchedAt - prev.fetchedAt;
  if (dtMs <= 0) return null;

  const dUsed = cur.used - prev.used;
  if (dUsed <= 0) return null; // 没消耗或窗口重置

  const dtHours = dtMs / 3_600_000;
  const rate = dUsed / dtHours;
  return Math.round(rate * 100) / 100;
}

/**
 * 预测按当前速率, 剩余额度何时耗尽.
 * @param {{used: number|null, remaining: number|null, fetchedAt: number}} cur
 * @param {{used: number|null, fetchedAt: number}|null} prev
 * @returns {number|null} epoch ms 耗尽时间; 不合法/超 24h 返 null
 */
function computeBlowUpAt(cur, prev) {
  const rate = computeBurnRate(cur, prev);
  if (rate === null || rate <= 0) return null;
  if (typeof cur.remaining !== 'number' || cur.remaining <= 0) return null;

  const hoursLeft = cur.remaining / rate;
  if (hoursLeft > MAX_BLOW_UP_HOURS) return null;

  return cur.fetchedAt + hoursLeft * 3_600_000;
}

/**
 * 把 epoch ms (blow-up) 格式化成 "X 小时后" / "X 分钟后" / "X 天后".
 * @param {number|null} epochMs
 * @param {number} [now=Date.now()]
 * @returns {string|null}
 */
function formatBlowUpIn(epochMs, now = Date.now()) {
  if (typeof epochMs !== 'number' || epochMs <= now) return null;
  const diffMs = epochMs - now;
  const hours = diffMs / 3_600_000;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} 天后`;
  }
  if (hours >= 1) {
    return `${Math.round(hours)} 小时后`;
  }
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  return `${minutes} 分钟后`;
}

module.exports = {
  computeBurnRate,
  computeBlowUpAt,
  formatBlowUpIn,
  MAX_BLOW_UP_HOURS,
};
