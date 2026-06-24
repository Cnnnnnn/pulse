/**
 * src/ai-usage/anomaly-detect.js
 *
 * A4: 7 日用量异常检测 (纯函数).
 *
 * ponytail: 今天 percent > 前 6 天中位数 × 1.5 且 ≥ 绝对阈值 55
 */
const { buildSeries, todayKey } = require("./history-series");

const SPIKE_RATIO = 1.5;
const ABS_MIN_PCT = 55;
const RE_ALERT_STEP_PCT = 5;

function median(nums) {
  if (!nums.length) return 0;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {Array<{date:string, percent:number}>} days
 * @param {object} [opts]
 * @param {number} [opts.lastNotifiedPercent]
 * @returns {{ anomaly: boolean, todayPercent: number|null, baselineMedian: number, reason: string|null }}
 */
function detectUsageAnomaly(days, opts = {}) {
  const empty = {
    anomaly: false,
    todayPercent: null,
    baselineMedian: 0,
    reason: null,
  };
  const { series } = buildSeries(days || [], 7);
  if (series.length < 2) return empty;

  const today = todayKey();
  const todayPoint =
    series.find((p) => p.date === today) || series[series.length - 1];
  const todayPercent =
    typeof todayPoint.percent === "number" ? todayPoint.percent : null;
  if (todayPercent == null || todayPercent <= 0) return empty;

  const prev = series
    .filter(
      (p) => p.date !== today && typeof p.percent === "number" && p.percent > 0,
    )
    .map((p) => p.percent);
  if (prev.length < 2) return empty;

  const baselineMedian = median(prev);
  const spike =
    todayPercent >= ABS_MIN_PCT && todayPercent >= baselineMedian * SPIKE_RATIO;

  if (!spike) return { ...empty, todayPercent, baselineMedian };

  const last = opts.lastNotifiedPercent;
  if (typeof last === "number" && todayPercent < last + RE_ALERT_STEP_PCT) {
    return { anomaly: false, todayPercent, baselineMedian, reason: "deduped" };
  }

  return {
    anomaly: true,
    todayPercent,
    baselineMedian,
    reason: "spike",
  };
}

module.exports = {
  SPIKE_RATIO,
  ABS_MIN_PCT,
  RE_ALERT_STEP_PCT,
  detectUsageAnomaly,
};
