/**
 * src/renderer/components/NewCarReleaseKPIs.jsx
 *
 * KPI 概览条: 本月 / 本周 / 今年累计 / 即将发布. 复用 KPICard.
 * 纯展示, 无 state, 无副作用.
 */

import { KPICard } from './KPICard.jsx';

/**
 * @param {object} props
 * @param {import('../../newcar/types.js').Kpis} props.kpis
 * @param {number[]} [props.trend]  预留: P1 按月趋势序列 (供 sparkline)
 */
export function NewCarReleaseKPIs({ kpis }) {
  if (!kpis) return null;
  return (
    <div class="newcar-kpis">
      <KPICard label="本月发布" value={kpis.thisMonth} variant="default" testId="newcar-kpi-month" />
      <KPICard label="本周发布" value={kpis.thisWeek} variant="neutral" testId="newcar-kpi-week" />
      <KPICard label="今年累计" value={kpis.ytd} variant="success" testId="newcar-kpi-ytd" />
      <KPICard label="即将发布" value={kpis.upcoming} variant="warning" testId="newcar-kpi-upcoming" />
    </div>
  );
}

export default NewCarReleaseKPIs;
