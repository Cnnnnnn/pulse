/**
 * src/renderer/components/OverviewKPIWall.jsx
 *
 * v2.50 (T1): Overview 列 1 — 4 数字渐进式 KPI 墙.
 * 无 state, 无副作用. 纯展示. 输入 signal, 输出 4 行 (数字 + 标签).
 */
import "./OverviewKPIWall.css";

const FIELDS = [
  { key: "upgradable", label: "个可升级", className: "kpi-number-large" },
  { key: "latest", label: "个最新", className: "kpi-number-small" },
  { key: "error", label: "个出错", className: "kpi-number-small" },
  { key: "total", label: "总监控", className: "kpi-number-small" },
];

export function OverviewKPIWall({ kpis }) {
  return (
    <div class="overview-kpi-wall" role="list">
      {FIELDS.map(({ key, label, className }) => (
        <div key={key} class="kpi-row" role="listitem">
          <span class={`kpi-number ${className}`}>{kpis.value[key]}</span>
          <span class="kpi-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default OverviewKPIWall;
