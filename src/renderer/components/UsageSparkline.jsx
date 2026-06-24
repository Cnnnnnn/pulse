/**
 * src/renderer/components/UsageSparkline.jsx
 *
 * 每日用量的 mini bar chart (sparkline).
 */

import { useMemo, useState } from "preact/hooks";
import { buildSeries } from "../../ai-usage/history-series.js";

const DEFAULT_DAYS = 7;

/**
 * @param {object} props
 * @param {{days: Array<{date: string, percent: number, used?: number|null}>}} props.history
 * @param {number} [props.days=7]
 * @param {number} [props.height=56]
 * @param {boolean} [props.anomalyToday=false]
 */
export function UsageSparkline({
  history,
  days = DEFAULT_DAYS,
  height = 56,
  anomalyToday = false,
}) {
  const [hoverIdx, setHoverIdx] = useState(-1);

  const data = useMemo(
    () => buildSeries(history && history.days ? history.days : [], days),
    [history, days],
  );

  return (
    <div class="ai-usage-sparkline">
      <div class="ai-usage-sparkline-bars" style={{ height: `${height}px` }}>
        {data.series.map((p, idx) => {
          const hasData = typeof p.percent === "number" && p.percent > 0;
          const barH = hasData
            ? Math.max(2, Math.round((p.percent / 100) * (height - 6)))
            : 0;
          const isToday = idx === data.series.length - 1;
          const isHover = idx === hoverIdx;
          const cls = [
            "ai-usage-sparkline-bar",
            hasData ? "ai-usage-sparkline-bar--filled" : "ai-usage-sparkline-bar--empty",
            isToday ? "ai-usage-sparkline-bar--today" : "",
            isToday && anomalyToday ? "ai-usage-sparkline-bar--anomaly" : "",
            isHover ? "ai-usage-sparkline-bar--hover" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={p.date}
              class={cls}
              style={{ height: `${barH}px` }}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(-1)}
              title={formatTooltip(p)}
            />
          );
        })}
      </div>
      <div class="ai-usage-sparkline-x-labels">
        {data.series.map((p, idx) => {
          const showLabel =
            idx === 0 ||
            idx === data.series.length - 1 ||
            idx === Math.floor(data.series.length / 2);
          return (
            <div key={p.date} class="ai-usage-sparkline-x-label">
              {showLabel ? p.date.slice(5) : ""}
            </div>
          );
        })}
      </div>
      {hoverIdx >= 0 && data.series[hoverIdx] && (
        <div class="ai-usage-sparkline-tooltip">
          {formatTooltip(data.series[hoverIdx])}
        </div>
      )}
    </div>
  );
}

function formatTooltip(p) {
  const dateLabel = formatDateLabel(p.date);
  if (typeof p.percent !== "number" || p.percent === 0) {
    return `${dateLabel}: 无数据`;
  }
  if (typeof p.used === "number" && p.used > 0) {
    return `${dateLabel}: 已用 ${p.percent}% (${p.used.toLocaleString()} 单位)`;
  }
  return `${dateLabel}: 已用 ${p.percent}%`;
}

function formatDateLabel(yyyyMmDd) {
  const [, m, d] = yyyyMmDd.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export { buildSeries };
