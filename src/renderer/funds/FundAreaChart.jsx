/**
 * src/renderer/funds/FundAreaChart.jsx
 *
 * 2026-07-14 计划 §1.3 / §2 — 基金模块共享面积走势图.
 *
 * 沿用现有 SVG 写法: viewBox="0 0 W H" preserveAspectRatio="none" +
 * vector-effect="non-scaling-stroke", 已验证在 Electron/Chromium 中无溢出/裁切.
 *
 * 与原型 charts.area 的差异:
 *   - 颜色取值: 用 var(--fund-brand) 直写 (stroke 在 Electron/Chromium 正常解析,
 *     无需 cv() 解析为色值); 仅在 stop-color / text fill 处使用解析后的色值
 *     (按计划 §1.3 决策).
 *   - 数据: 接受 [{date, value}], 无数据 → 占位.
 *   - Hover: 与原型一致, 通过 SVG data-points 属性 + 容器 mousemove 切换
 *     hover-line / hover-dot 透明度, 浮窗 .fund-area-tip absolute 定位.
 */

import { useEffect, useRef, useState } from "preact/hooks";

const W = 720;
const H = 240;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 18;
const PAD_B = 30;

function resolveColor(name, fallback) {
  if (typeof document === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateLabel(d) {
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(5) : s;
}

function buildPath(pts) {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.vx.toFixed(1)} ${p.vy.toFixed(1)}`)
    .join(" ");
}

function buildAreaPath(pts, plotBottom) {
  if (!pts.length) return "";
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${buildPath(pts)} L ${last.vx.toFixed(1)} ${plotBottom} L ${first.vx.toFixed(1)} ${plotBottom} Z`;
}

export function FundAreaChart({
  series,
  formatValue = fmtMoney,
  formatLabel = fmtDateLabel,
  ariaLabel = "基金走势",
  emptyHint = "暂无数据",
}) {
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(-1);

  const data = Array.isArray(series) ? series.filter((s) => Number.isFinite(s.value)) : [];

  useEffect(() => {
    setHoverIdx(-1);
  }, [series]);

  if (!data.length) {
    return (
      <div class="fund-area-wrap" role="img" aria-label={`${ariaLabel} (无数据)`}>
        <div class="fund-empty-card">{emptyHint}</div>
      </div>
    );
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const plotBottom = PAD_T + plotH;
  const vals = data.map((d) => Number(d.value));
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const span = max - min || 1;
  min -= span * 0.12;
  max += span * 0.12;

  const n = data.length;
  const step = plotW / (n - 1 || 1);
  const points = data.map((d, i) => ({
    vx: PAD_L + i * step,
    vy: plotBottom - ((Number(d.value) - min) / (max - min || 1)) * plotH,
    value: d.value,
    label: d.date || d.label || "",
  }));

  const linePath = buildPath(points);
  const areaPath = buildAreaPath(points, plotBottom);

  const brand = "var(--fund-brand)";
  const brandStop = resolveColor("--fund-brand", "oklch(58% 0.085 195)");
  const cBorder = resolveColor("--border-subtle", "rgba(0,0,0,0.08)");
  const cText3 = resolveColor("--text-tertiary", "rgba(0,0,0,0.55)");

  const gridSteps = 4;
  const gridLines = [];
  for (let g = 0; g <= gridSteps; g++) {
    const y = PAD_T + (plotH / gridSteps) * g;
    const v = max - ((max - min) / gridSteps) * g;
    gridLines.push({ y, v });
  }
  const xticks = Math.min(6, n);
  const xLabels = [];
  for (let t = 0; t < xticks; t++) {
    const idx = Math.round((n - 1) * (t / (xticks - 1 || 1)));
    xLabels.push({ x: points[idx].vx, label: formatLabel(points[idx].label) });
  }

  const gradId = `fac-${Math.random().toString(36).slice(2, 8)}`;
  const showHover = hoverIdx >= 0 && hoverIdx < points.length;
  const hover = showHover ? points[hoverIdx] : null;

  function onMove(e) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].vx - vx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }
  function onLeave() {
    setHoverIdx(-1);
  }

  const tipStyle = hover
    ? {
        left: `${(hover.vx / W) * 100}%`,
        top: `${(hover.vy / H) * 100}%`,
      }
    : null;

  return (
    <div
      ref={wrapRef}
      class="fund-area-wrap"
      role="img"
      aria-label={ariaLabel}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={brandStop} stop-opacity="0.32" />
            <stop offset="100%" stop-color={brandStop} stop-opacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <g key={`g-${i}`}>
            <line
              x1={PAD_L}
              y1={g.y.toFixed(1)}
              x2={W - PAD_R}
              y2={g.y.toFixed(1)}
              stroke={cBorder}
              stroke-width="1"
            />
            <text
              x={PAD_L + 2}
              y={(g.y - 4).toFixed(1)}
              font-size="10.5"
              fill={cText3}
              font-family="ui-monospace, monospace"
            >
              {Math.round(g.v).toLocaleString()}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) => (
          <text
            key={`x-${i}`}
            x={l.x.toFixed(1)}
            y={H - 10}
            font-size="10.5"
            fill={cText3}
            text-anchor="middle"
          >
            {l.label}
          </text>
        ))}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={brand}
          stroke-width="2.2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        {hover && (
          <line
            x1={hover.vx.toFixed(1)}
            y1={PAD_T}
            x2={hover.vx.toFixed(1)}
            y2={plotBottom}
            stroke="var(--fund-brand-2)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            opacity="0.6"
          />
        )}
        {/* 2026-07-15: 加横向虚线 — 形成完整十字, 便于读取 y 轴数值
           ponytail: dasharray 让它和 grid 区分 (实线是 grid, 虚线是 hover) */}
        {hover && (
          <line
            x1={PAD_L}
            y1={hover.vy.toFixed(1)}
            x2={W - PAD_R}
            y2={hover.vy.toFixed(1)}
            stroke="var(--fund-brand-2)"
            stroke-width="1"
            stroke-dasharray="3 3"
            vector-effect="non-scaling-stroke"
            opacity="0.45"
          />
        )}
        {hover && (
          <circle
            cx={hover.vx.toFixed(1)}
            cy={hover.vy.toFixed(1)}
            r="4.5"
            fill={brand}
            stroke="var(--bg-card)"
            stroke-width="2.5"
          />
        )}
      </svg>
      {/* 2026-07-15: tooltip 增强 — 多显示日变化 (值 + 百分比), 让用户看到「这一天涨/跌了多少」 */}
      <div
        class={`fund-area-tip${hover ? " show" : ""}`}
        style={tipStyle}
        aria-hidden={!hover}
      >
        {hover && (() => {
          const prev = hoverIdx > 0 ? points[hoverIdx - 1] : null;
          const deltaVal = prev ? Number(hover.value) - Number(prev.value) : null;
          const deltaPct = prev && Number(prev.value) > 0
            ? ((Number(hover.value) - Number(prev.value)) / Number(prev.value)) * 100
            : null;
          return (
            <>
              <div class="fund-area-tip-row">
                <span class="fund-area-tip-date">{formatLabel(hover.label)}</span>
                <span class="fund-area-tip-val">{formatValue(hover.value)}</span>
              </div>
              {deltaVal != null && Number.isFinite(deltaVal) && (
                <div class={`fund-area-tip-delta ${deltaVal >= 0 ? "up" : "down"}`}>
                  {deltaVal >= 0 ? "▲" : "▼"}
                  {Math.abs(deltaVal).toFixed(2)}
                  {deltaPct != null && Number.isFinite(deltaPct) && (
                    <span class="fund-area-tip-delta-pct">
                      ({deltaPct >= 0 ? "+" : ""}
                      {deltaPct.toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

export default FundAreaChart;