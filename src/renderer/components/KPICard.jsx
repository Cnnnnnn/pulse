/**
 * src/renderer/components/KPICard.jsx
 *
 * 单个 KPI 卡片 (label + value + variant). 纯展示, 无 state, 无副作用.
 * 历史: 曾用于 v2.50 dashboard OverviewPage 顶部指标条; OverviewPage 已于
 * 2026-06-27 移除, 本组件保留备查 (Insights 页后续可复用).
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