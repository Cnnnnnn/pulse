/**
 * src/renderer/funds/FundRadar.jsx
 *
 * 2026-07-14 计划 §2 / Phase 3 — 基金风险雷达.
 *
 * 输入: metrics: [{ label, norm (0..1), value? }]
 *   norm 已归一化到 0..1, value 用于中心文字展示.
 * 渲染: 4 圈网格 + 5 边形 (n=5) 或 n 边形, 数据点 + 多边形填充.
 * 颜色: var(--fund-brand) (stroke + fill-opacity 0.18), 与计划 §1.3 一致.
 */

import { useMemo } from "preact/hooks";

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 34;

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

export function FundRadar({
  metrics,
  ariaLabel = "风险雷达",
}) {
  const data = Array.isArray(metrics) ? metrics.filter((m) => m && m.label) : [];
  const brand = "var(--fund-brand)";
  const brandStop = resolveColor("--fund-brand", "oklch(58% 0.085 195)");
  const cBorder = resolveColor("--border-subtle", "rgba(0,0,0,0.08)");
  const cText = resolveColor("--text-secondary", "rgba(0,0,0,0.55)");

  const rings = useMemo(() => {
    if (!data.length) return null;
    const out = [];
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const pts = data
        .map((_, i) => {
          const a = (Math.PI * 2 * i) / data.length - Math.PI / 2;
          return [CX + Math.cos(a) * R * f, CY + Math.sin(a) * R * f]
            .map((v) => v.toFixed(1))
            .join(",");
        })
        .join(" ");
      out.push({ pts });
    }
    return out;
  }, [data.length]);

  const axes = useMemo(() => {
    if (!data.length) return null;
    return data.map((_, i) => {
      const a = (Math.PI * 2 * i) / data.length - Math.PI / 2;
      const x = CX + Math.cos(a) * R;
      const y = CY + Math.sin(a) * R;
      const lx = CX + Math.cos(a) * (R + 18);
      const ly = CY + Math.sin(a) * (R + 18);
      return {
        x,
        y,
        lx,
        ly,
        label: data[i].label,
      };
    });
  }, [data]);

  const poly = useMemo(() => {
    if (!data.length) return null;
    const pts = data
      .map((m, i) => {
        const a = (Math.PI * 2 * i) / data.length - Math.PI / 2;
        const r = R * Math.max(0.05, Math.min(1, Number(m.norm) || 0));
        return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
      })
      .map((p) => p.map((v) => v.toFixed(1)).join(","))
      .join(" ");
    return pts;
  }, [data]);

  if (!data.length) {
    return (
      <div class="fund-radar-wrap" role="img" aria-label="风险雷达 (无数据)">
        <div class="fund-empty-card">暂无风险指标</div>
      </div>
    );
  }

  return (
    <div class="fund-radar-wrap" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {rings.map((r, i) => (
          <polygon
            key={`r-${i}`}
            points={r.pts}
            fill="none"
            stroke={cBorder}
            stroke-width="1"
          />
        ))}
        {axes.map((a, i) => (
          <g key={`a-${i}`}>
            <line
              x1={CX}
              y1={CY}
              x2={a.x.toFixed(1)}
              y2={a.y.toFixed(1)}
              stroke={cBorder}
              stroke-width="1"
            />
            <text
              x={a.lx.toFixed(1)}
              y={(a.ly + 3).toFixed(1)}
              text-anchor="middle"
              font-size="10.5"
              fill={cText}
            >
              {a.label}
            </text>
          </g>
        ))}
        <polygon
          points={poly}
          fill={brandStop}
          fill-opacity="0.18"
          stroke={brand}
          stroke-width="2"
        />
        {data.map((m, i) => {
          const a = (Math.PI * 2 * i) / data.length - Math.PI / 2;
          const r = R * Math.max(0.05, Math.min(1, Number(m.norm) || 0));
          const x = CX + Math.cos(a) * r;
          const y = CY + Math.sin(a) * r;
          return (
            <circle key={`d-${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3" fill={brand} />
          );
        })}
      </svg>
    </div>
  );
}

export default FundRadar;