/**
 * src/ai-usage/anomaly-detect.ts
 *
 * A4: 7 日用量异常检测 (纯函数).
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

import { buildSeries, todayKey } from "./history-series";

export const DEFAULT_SPIKE_RATIO = 1.5;
export const DEFAULT_ABS_MIN_PCT = 55;
export const DEFAULT_RE_ALERT_STEP_PCT = 5;

function median(nums: any) {
  if (!nums.length) return 0;
  const sorted = nums.slice().sort((a: any, b: any) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {Array<{date:string, percent:number}>} days
 * @param {object} [opts]
 */
export function detectUsageAnomaly(days, opts: any = {}) {
  const spikeRatio =
    Number.isFinite(opts.spikeRatio) && opts.spikeRatio > 0
      ? opts.spikeRatio
      : DEFAULT_SPIKE_RATIO;
  const absMinPct =
    Number.isFinite(opts.absMinPct) && opts.absMinPct > 0
      ? opts.absMinPct
      : DEFAULT_ABS_MIN_PCT;
  const reAlertStepPct =
    Number.isFinite(opts.reAlertStepPct) && opts.reAlertStepPct > 0
      ? opts.reAlertStepPct
      : DEFAULT_RE_ALERT_STEP_PCT;

  const empty = {
    anomaly: false,
    todayPercent: null,
    baselineMedian: 0,
    reason: null,
  };
  if (opts.enabled === false) return empty;

  const { series } = buildSeries(days || [], 7);
  if (series.length < 2) return empty;

  const today = todayKey();
  const todayPoint =
    series.find((p: any) => p.date === today) || series[series.length - 1];
  const todayPercent =
    typeof todayPoint.percent === "number" ? todayPoint.percent : null;
  if (todayPercent == null || todayPercent <= 0) return empty;

  const prev = series
    .filter(
      (p: any) => p.date !== today && typeof p.percent === "number" && p.percent > 0,
    )
    .map((p: any) => p.percent);
  if (prev.length < 2) return empty;

  const baselineMedian = median(prev);
  const spike =
    todayPercent >= absMinPct && todayPercent >= baselineMedian * spikeRatio;

  if (!spike) return { ...empty, todayPercent, baselineMedian };

  const last = opts.lastNotifiedPercent;
  if (typeof last === "number" && todayPercent < last + reAlertStepPct) {
    return { anomaly: false, todayPercent, baselineMedian, reason: "deduped" };
  }

  return {
    anomaly: true,
    todayPercent,
    baselineMedian,
    reason: "spike",
  };
}

