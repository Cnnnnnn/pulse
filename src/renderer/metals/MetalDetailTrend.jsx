/**
 * src/renderer/metals/MetalDetailTrend.jsx
 *
 * 选中品种的近 30 天大图: 折线 + 面积 + 起/终/高/低/均/区间.
 */
import { historyMap, selectedMetalId } from "./metalStore.js";
import { getMetalById } from "../../metals/metal-config.js";
import { SparklineArea } from "../components/SparklineArea.jsx";

export function MetalDetailTrend() {
  const id = selectedMetalId.value;
  const metal = getMetalById(id);
  if (!metal) return null;
  const arr = historyMap.value[id] || [];
  const closes = arr.map((p) => p.close / (metal.unitDivisor || 1));

  if (closes.length < 2) {
    return (
      <div class="metals-detail-trend-empty">30 天数据待刷新</div>
    );
  }

  const first = closes[0];
  const last = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const pct = ((last - first) / first) * 100;
  const colorKey = last > first ? "up" : last < first ? "down" : "flat";
  const pctSign = pct >= 0 ? "+" : "";

  return (
    <div class={`metals-detail-trend metals-detail-trend-${colorKey}`}>
      <div class="metals-detail-trend-head">
        <span class="metals-detail-trend-name">{metal.name}</span>
        {metal.proxyLabel && (
          <span class="metals-detail-trend-proxy">{metal.proxyLabel}</span>
        )}
        <span class="metals-detail-trend-range">近 {closes.length} 天</span>
      </div>
      <div class="metals-detail-trend-figure">
        <span class="metals-detail-trend-last">¥{last.toFixed(2)}/克</span>
        <span class={`metals-detail-trend-pct pct-${colorKey}`}>
          {pctSign}{pct.toFixed(2)}%
        </span>
        <span class="metals-detail-trend-meta">
          {closes.length} 天前 ¥{first.toFixed(2)} → 今 ¥{last.toFixed(2)}
        </span>
      </div>
      <div class="metals-detail-trend-chart">
        <SparklineArea closes={closes} width={560} height={120} />
      </div>
      <div class="metals-detail-trend-stats">
        <span>高 <b>{high.toFixed(2)}</b></span>
        <span>低 <b>{low.toFixed(2)}</b></span>
        <span>均 <b>{avg.toFixed(2)}</b></span>
        <span>区间 <b>{pctSign}{pct.toFixed(2)}%</b></span>
      </div>
    </div>
  );
}
