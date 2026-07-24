/**
 * src/renderer/components/KPICard.tsx
 *
 * 单个 KPI 卡片 (label + value + variant). 纯展示, 无 state, 无副作用.
 * variant: default(blue) / success(green) / warning(orange) / danger(red) / neutral(gray).
 * 历史: 曾用于 v2.50 dashboard OverviewPage; 现被 Insights / Diagnostics 页复用.
 */
import type { ComponentChildren } from "preact";

export function KPICard({
  label,
  value,
  variant = "default",
  testId,
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  variant?: string;
  testId?: string;
}) {
  return (
    <div
      class={`kpi-card kpi-card--${variant}`}
      {...(testId ? { "data-testid": testId } : {})}
    >
      <div class="kpi-card-value">{value}</div>
      <div class="kpi-card-label">{label}</div>
    </div>
  );
}

export default KPICard;