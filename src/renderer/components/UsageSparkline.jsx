/**
 * src/renderer/components/UsageSparkline.jsx
 *
 * 近 N 天用量的 mini 折线图 (SVG).
 *
 * ponytail: 历史版本是柱状 bar (div 高度), 用户反馈换成折线. 沿用 buildSeries
 * 数据形状 (SeriesPoint[]), 内部用纯 SVG path 渲染 — 跟 UsageTrendChart 思路
 * 类似但简化为单序列 mini 图. 保留 x-labels + hover tooltip 交互.
 */

import { useMemo, useState } from "preact/hooks";
import { buildSeries } from "../../ai-usage/history-series.js";

const DEFAULT_DAYS = 7;
const PAD_X = 4;
const PAD_TOP = 6;
const PAD_BOTTOM = 2;

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

  const W = 220;
  const H = height;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  // 数值 → y 坐标. percent 范围 0-100.
  const max = 100;
  const xAt = (i) => {
    if (data.series.length <= 1) return PAD_X + (W - 2 * PAD_X) / 2;
    return PAD_X + (i * (W - 2 * PAD_X)) / (data.series.length - 1);
  };
  const yAt = (v) => {
    const norm = Math.max(0, Math.min(1, v / max));
    return H - PAD_BOTTOM - norm * innerH;
  };

  // 折线路径 + 闭合面积路径
  const { linePath, areaPath } = useMemo(() => {
    let d = "";
    for (let i = 0; i < data.series.length; i++) {
      const v = typeof data.series[i].percent === "number" ? data.series[i].percent : 0;
      d += `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)} `;
    }
    const line = d.trim();
    if (data.series.length === 0) {
      return { linePath: "", areaPath: "" };
    }
    const x0 = xAt(0).toFixed(2);
    const xN = xAt(data.series.length - 1).toFixed(2);
    const yBase = (H - PAD_BOTTOM).toFixed(2);
    const area = `${line} L ${xN} ${yBase} L ${x0} ${yBase} Z`;
    return { linePath: line, areaPath: area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.series, height]);

  const lastIdx = data.series.length - 1;
  const lastPoint = lastIdx >= 0 ? data.series[lastIdx] : null;
  const lastPct = lastPoint && typeof lastPoint.percent === "number" ? lastPoint.percent : null;

  if (data.series.length === 0) {
    return (
      <div class="ai-usage-sparkline">
        <div class="ai-usage-sparkline-empty">暂无数据</div>
      </div>
    );
  }

  return (
    <div class="ai-usage-sparkline">
      <svg
        class="ai-usage-sparkline-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: `${H}px` }}
        aria-label="近期用量折线图"
        role="img"
      >
        {/* 面积 + 折线 */}
        {areaPath && <path d={areaPath} class="ai-usage-sparkline-area" />}
        {linePath && <path d={linePath} class="ai-usage-sparkline-stroke" />}
        {/* hover 命中区 (整段, 每点一个透明 rect) */}
        {data.series.map((p, idx) => {
          const cw = (W - 2 * PAD_X) / data.series.length;
          return (
            <rect
              key={p.date}
              x={xAt(idx) - cw / 2}
              y={PAD_TOP}
              width={cw}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(-1)}
            >
              <title>{formatTooltip(p)}</title>
            </rect>
          );
        })}
        {/* hover + today 标记 */}
        {data.series.map((p, idx) => {
          const v = typeof p.percent === "number" ? p.percent : 0;
          const isToday = idx === lastIdx;
          const isHover = idx === hoverIdx;
          const isAnomaly = isToday && anomalyToday;
          if (!isHover && !isToday) return null;
          const cls = [
            "ai-usage-sparkline-point",
            isHover ? "ai-usage-sparkline-point--hover" : "",
            isToday ? "ai-usage-sparkline-point--today" : "",
            isAnomaly ? "ai-usage-sparkline-point--anomaly" : "",
          ].filter(Boolean).join(" ");
          return <circle key={`pt-${p.date}`} cx={xAt(idx)} cy={yAt(v)} r="2.5" class={cls} />;
        })}
      </svg>
      <div class="ai-usage-sparkline-x-labels">
        {data.series.map((p, idx) => {
          const showLabel =
            idx === 0 || idx === lastIdx || idx === Math.floor(data.series.length / 2);
          return (
            <div key={p.date} class="ai-usage-sparkline-x-label">
              {showLabel ? p.date.slice(5) : ""}
            </div>
          );
        })}
      </div>
      {hoverIdx >= 0 && data.series[hoverIdx] && (
        <div class="ai-usage-sparkline-tooltip">{formatTooltip(data.series[hoverIdx])}</div>
      )}
      {/* a11y: 隐藏的 text 表 — 屏幕阅读器可读 */}
      <div class="ai-usage-visually-hidden">
        近 {data.series.length} 天用量:{" "}
        {data.series.map((p, idx) => {
          const sep = idx === 0 ? "" : ", ";
          return `${sep}${formatTooltip(p)}`;
        })}
        {typeof lastPct === "number" ? `。今日已用 ${lastPct}%` : ""}
      </div>
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
