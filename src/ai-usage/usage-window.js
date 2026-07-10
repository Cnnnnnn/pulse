/**
 * src/ai-usage/usage-window.js
 *
 * 纯函数: 把"已用百分比 + 限流状态"归一化成展示用 level.
 * 给 UI (ModelBlockDetail / 状态徽章) 消费.
 *
 * 设计: 不依赖 preact / electron, 可单独测.
 */

const LEVELS = ["healthy", "tense", "critical", "throttled", "unknown"];

/**
 * @typedef {Object} UsageLevel
 * @property {"healthy"|"tense"|"critical"|"throttled"|"unknown"} level
 * @property {string} label         中文展示名
 * @property {string} cssClass      className 后缀 (不带 `.ai-usage-status--`)
 * @property {number} [priority]    数值越大越严重, 排序用
 */

const TENSE_MIN_PCT = 60;
const CRITICAL_MIN_PCT = 85;

/**
 * @param {number|null|undefined} usedPercent  0-100
 * @param {number|null|undefined} status       API status code: 1=正常, 0=已限流
 * @param {object} [opts]
 * @param {number} [opts.tenseMinPct=60]
 * @param {number} [opts.criticalMinPct=85]
 * @returns {UsageLevel}
 */
function classifyUsageLevel(usedPercent, status, opts = {}) {
  const tenseMin =
    Number.isFinite(opts.tenseMinPct) && opts.tenseMinPct > 0
      ? opts.tenseMinPct
      : TENSE_MIN_PCT;
  const criticalMin =
    Number.isFinite(opts.criticalMinPct) && opts.criticalMinPct > tenseMin
      ? opts.criticalMinPct
      : CRITICAL_MIN_PCT;

  // status === 0 是限流, 优先级最高 (不论百分比多少)
  if (status === 0) {
    return { level: "throttled", label: "已限流", cssClass: "throttled", priority: 4 };
  }

  // 没百分比: 不知道当前多紧张, 标 unknown
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return { level: "unknown", label: "未知", cssClass: "unknown", priority: 0 };
  }

  if (usedPercent >= criticalMin) {
    return { level: "critical", label: "告急", cssClass: "critical", priority: 3 };
  }
  if (usedPercent >= tenseMin) {
    return { level: "tense", label: "紧张", cssClass: "tense", priority: 2 };
  }
  return { level: "healthy", label: "健康", cssClass: "healthy", priority: 1 };
}

module.exports = {
  classifyUsageLevel,
  LEVELS,
  TENSE_MIN_PCT,
  CRITICAL_MIN_PCT,
};