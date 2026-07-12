import { useEffect } from "preact/hooks";
import { dailySnapshots, benchmarkEnabled, indexHistoryCache, benchmarkError, loadIndexHistory, DEFAULT_BENCHMARK } from "./fundStore.js";
import { api } from "../api.js";

export function recentTotals(snaps, days = 30) {
  const arr = Array.isArray(snaps) ? snaps : [];
  const sorted = [...arr].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.slice(-days).map((s) => ({ date: s.date, value: s.totalMarketValue || 0 }));
}
export function buildLinePath(pts) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}
export function buildAreaPath(pts, h) {
  if (!pts.length) return "";
  const first = pts[0], last = pts[pts.length - 1];
  return `${buildLinePath(pts)} L ${last.x} ${h} L ${first.x} ${h} Z`;
}

// ── T-C1c: 基准指数对齐 + 归一化 helper (纯函数, 可测) ──

/** 把基准 series 拍成 date → value 的 Map */
export function buildDateMap(series) {
  const m = new Map();
  if (!Array.isArray(series)) return m;
  for (const p of series) {
    if (p && p.date != null && Number.isFinite(p.value)) {
      m.set(String(p.date), p.value);
    }
  }
  return m;
}

/**
 * 以组合日期集合为轴, 从基准 map 取数, 缺失日前向填充 (leading 用首个有效值补全).
 * 返回与 dates 等长的值数组; 基准无任何数据 → null.
 */
export function alignBenchmark(dates, benchMap) {
  if (!benchMap || benchMap.size === 0) return null;
  let last = null;
  const out = [];
  for (const d of dates) {
    const v = benchMap.get(d);
    if (v != null) last = v;
    out.push(last);
  }
  const firstVal = out.find((v) => v != null);
  if (firstVal == null) return null;
  for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = firstVal;
  return out;
}

/** 把一组数值独立归一化到 viewBox (与组合线共用 x 轴) */
export function toPoints(values, W, H, PAD) {
  if (!values || values.length === 0) return [];
  const vals = values.map((v) => (Number.isFinite(v) ? v : 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = vals.length;
  return vals.map((v, i) => ({
    x: PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD * 2)),
    y: H - PAD - ((v - min) / span) * (H - PAD * 2),
  }));
}

export function FundPortfolioTrend() {
  const snaps = recentTotals(dailySnapshots.value, 30);
  const symbol = DEFAULT_BENCHMARK;
  const enabled = benchmarkEnabled.value;
  const hasError = !!benchmarkError.value;
  const benchSeries = enabled ? indexHistoryCache.value[symbol] || [] : [];

  // 启用且缓存空 + 无错误 → 拉一次 (含 alive 清理)
  useEffect(() => {
    if (!enabled) return;
    if (benchmarkError.value) return;
    if (indexHistoryCache.value[symbol] && indexHistoryCache.value[symbol].length) return;
    loadIndexHistory(api, symbol).catch(() => {});
  }, [enabled, symbol]);

  if (!snaps.length) return <div class="fund-trend fund-trend--empty">净值刷新后展示近 30 天走势</div>;

  const W = 300, H = 90, PAD = 6;
  const comboVals = snaps.map((s) => s.value);
  const comboPts = toPoints(comboVals, W, H, PAD);

  const benchMap = buildDateMap(benchSeries);
  const benchAligned = enabled && !hasError ? alignBenchmark(snaps.map((s) => s.date), benchMap) : null;
  const showBench = benchAligned != null;
  const benchPts = showBench ? toPoints(benchAligned, W, H, PAD) : [];

  function toggleBenchmark() {
    benchmarkEnabled.value = !benchmarkEnabled.value;
  }

  return (
    <div class="fund-trend" role="img" aria-label={`近30天组合净值走势${showBench ? " (含沪深300基准)" : ""}`}>
      <div class="fund-trend-toolbar">
        <button
          type="button"
          class="fund-trend-toggle"
          aria-pressed={benchmarkEnabled.value}
          onClick={toggleBenchmark}
          title={benchmarkEnabled.value ? "隐藏基准" : "显示基准"}
        >
          基准
        </button>
        {hasError && <span class="fund-trend-badge">基准不可用</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} class="fund-trend-svg" preserveAspectRatio="none" aria-hidden="true">
        <path d={buildAreaPath(comboPts, H)} fill="var(--fund-trend-area)" />
        <path d={buildLinePath(comboPts)} fill="none" stroke="var(--fund-trend)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {showBench && (
          <path
            class="fund-trend-bench"
            d={buildLinePath(benchPts)}
            fill="none"
            stroke="var(--text-tertiary)"
            stroke-width="1.5"
            stroke-dasharray="4 3"
            opacity="0.6"
            vector-effect="non-scaling-stroke"
          />
        )}
      </svg>
      <div class="fund-trend-legend">
        <span class="fund-trend-legend-item"><span class="fund-trend-legend-swatch fund-trend-legend-swatch-combo" />组合</span>
        <span class="fund-trend-legend-item"><span class="fund-trend-legend-swatch fund-trend-legend-swatch-bench" />沪深300</span>
      </div>
    </div>
  );
}
export default FundPortfolioTrend;
