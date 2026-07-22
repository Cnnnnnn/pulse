/**
 * src/renderer/ai-leaderboard/VendorPieChart.jsx
 *
 * 厂商份额环形图：把 rows 按 Arena ELO 聚合成厂商 profile，
 * 取 ELO 最高的前 5 个厂商渲染份额环形（donut）。
 *
 * 数据流：rows (AiModel[]) → aggregateVendorProfiles(rows) → Map<vendor, profile>
 *      → [...map.entries()] 展开成 [{vendor, ...profile}, ...]
 *      → topVendorsByArena(arr, 5) 取 ELO 前 5
 *      → 每个 sector 的圆心角 = (profile.arena / total) * 2π
 *
 * VENDOR_COLORS 仅硬编码 top 5（与品牌识别色一致），未知厂商 fallback 灰。
 * 不写入 VENDOR_META（types.js 改动超出本任务范围）。
 */

import { aggregateVendorProfiles, topVendorsByArena, fmtVendor } from "./format.js";

// 硬编码 top 5 厂商色（与品牌识别色一致）。未知厂商 → FALLBACK_COLOR。
const VENDOR_COLORS = {
  openai: "#10a37f",
  anthropic: "#d97757",
  google: "#4285f4",
  meta: "#1877f2",
  mistral: "#ff7000",
  deepseek: "#4d6bfe",
};
const FALLBACK_COLOR = "#94a3b8";

const TOP_N = 5;
const CX = 100;
const CY = 100;
const R_OUTER = 90;
const R_INNER = 50;
const TAU = Math.PI * 2;

function polarToCartesian(cx, cy, r, angleRad) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

export function VendorPieChart({ rows }) {
  const profilesMap = aggregateVendorProfiles(rows);
  const profiles = [...profilesMap.entries()].map(([vendor, p]) => ({ vendor, ...p }));
  const top = topVendorsByArena(profiles, TOP_N);
  const total = top.reduce((s, p) => s + (p.arena || 0), 0);

  if (top.length === 0 || total <= 0) {
    return (
      <div class="ai-lb-pie">
        <p class="ai-lb-pie__empty">暂无数据</p>
      </div>
    );
  }

  // 从 12 点方向起顺时针铺（先转 −π/2 偏移）
  let acc = 0;
  const sectors = top.map((p) => {
    const value = p.arena || 0;
    const fraction = value / total;
    const startAngle = acc * TAU - Math.PI / 2;
    const endAngle = (acc + fraction) * TAU - Math.PI / 2;
    acc += fraction;
    return {
      vendor: p.vendor,
      value,
      d: arcPath(CX, CY, R_OUTER, R_INNER, startAngle, endAngle),
      color: VENDOR_COLORS[p.vendor] || FALLBACK_COLOR,
      label: fmtVendor(p.vendor),
    };
  });

  return (
    <div class="ai-lb-pie">
      <svg
        viewBox={`0 0 ${CX * 2} ${CY * 2}`}
        class="ai-lb-pie__svg"
        role="img"
        aria-label="厂商 Arena ELO 份额环形图"
      >
        {sectors.map((s) => (
          <path key={s.vendor} d={s.d} fill={s.color} stroke="var(--surface)" stroke-width="0.5">
            <title>{`${s.label} · ${s.value}`}</title>
          </path>
        ))}
      </svg>
      <ul class="ai-lb-pie__legend">
        {sectors.map((s) => (
          <li key={s.vendor} class="ai-lb-pie__legend-item">
            <span class="ai-lb-pie__swatch" style={{ background: s.color }} />
            <span class="ai-lb-pie__name">{s.label}</span>
            <span class="ai-lb-pie__val">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default VendorPieChart;