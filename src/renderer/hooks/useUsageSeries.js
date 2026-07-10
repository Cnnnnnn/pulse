/**
 * src/renderer/hooks/useUsageSeries.js
 *
 * 把真实的 AI 用量日序列（snapshot.usageSummary.dailyTokenUsage: number[]）
 * 适配成 UsageTrendChart 需要的并行序列点 SeriesPoint[]。
 *
 * 设计约束（来自 docs/usage-trend-chart-spec.md + 真实 API）:
 *   - 真实接口只暴露「每日总 token 数」扁平数组（约 90 天，旧→新）。
 *   - 因此 `total` 是唯一保证存在的序列，着色用 AI Coding 用量特性色
 *     （--app-minimax-code 琥珀）。
 *   - `lastWeek` 可作「7 天前同日」对照线，由扁平数组推导，无需额外接口。
 *   - `input` / `output` 当前接口未拆分，标记为可选，仅当上游提供 richer
 *     数据时填充（保持规范的可扩展性）。
 *
 * 组件本身只消费 SeriesPoint[]，数据适配职责在此 hook，符合「数据聚合由
 * 上层提供」的边界定义。
 */

import { useMemo } from "preact/hooks";

/**
 * 今天 ISO date（本地）。
 * @returns {string} "YYYY-MM-DD"
 */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 相对今天 N 天前的 ISO date。N 可为 0（今天）。
 * @param {number} daysAgo
 * @returns {string}
 */
function shiftDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 单点结构（与规范 SeriesPoint 对齐）。
 * @typedef {Object} SeriesPoint
 * @property {string} date   ISO date，旧→新递增
 * @property {number} total  当日总 token（琥珀特性色序列）
 * @property {number|null} lastWeek 7 天前同日值（对照线，可为 null）
 * @property {number} [input]
 * @property {number} [output]
 */

/**
 * @param {number[]|null|undefined} rawDaily
 * @param {Object} [options]
 * @param {boolean} [options.loading]
 * @param {boolean} [options.error]
 * @returns {{ points: SeriesPoint[], status: "loading"|"error"|"empty"|"ready", loading: boolean, error: boolean, count: number }}
 */
export function useUsageSeries(rawDaily, options = {}) {
  const { loading = false, error = false } = options;

  const points = useMemo(() => {
    if (!Array.isArray(rawDaily) || rawDaily.length === 0) return [];
    const n = rawDaily.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = typeof rawDaily[i] === "number" && Number.isFinite(rawDaily[i]) ? rawDaily[i] : 0;
      const daysAgo = n - 1 - i; // index n-1 → 今天
      const lwIdx = i - 7;
      const lastWeek = lwIdx >= 0
        ? (typeof rawDaily[lwIdx] === "number" ? rawDaily[lwIdx] : null)
        : null;
      out[i] = { date: shiftDate(daysAgo), total: v, lastWeek };
    }
    return out;
  }, [rawDaily]);

  const status = error ? "error" : loading ? "loading" : points.length === 0 ? "empty" : "ready";

  return { points, status, loading, error, count: points.length };
}

export { todayKey, shiftDate };
