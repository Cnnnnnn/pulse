/**
 * src/renderer/components/KPICard.jsx
 *
 * Overview 单个 KPI 卡片 (label + value + variant). 用于 Task 18 OverviewPage
 * 顶部的 4 列指标条. 无 state, 无副作用, 纯展示.
 */
export function KPICard({ label, value, variant = "default" }) {
  return (
    <div class={`kpi-card kpi-card--${variant}`}>
      <div class="kpi-card-value">{value}</div>
      <div class="kpi-card-label">{label}</div>
    </div>
  );
}

export default KPICard;