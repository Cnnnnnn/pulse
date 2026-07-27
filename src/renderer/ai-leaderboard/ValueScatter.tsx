/**
 * src/renderer/ai-leaderboard/ValueScatter.tsx
 *
 * AA 视角：Intelligence Index × Cost per Task（对齐官网主轴）。
 * X 轴：Cost per Task (USD, log scale) · 越低越好
 * Y 轴：智能指数 · 越高越好
 * 左上角 = 高智能且低任务成本区。
 *
 * 纯 SVG 实现，无外部图表库依赖。
 */

import { useState } from "preact/hooks";
import { toggleCompare, compareList } from "./aiLeaderboardStore.ts";

// 厂商 → 散点颜色（oklch 色相均匀分布）
const VENDOR_COLORS = {
  openai: "oklch(60% 0.18 150)",
  anthropic: "oklch(60% 0.16 25)",
  google: "oklch(60% 0.16 245)",
  meta: "oklch(60% 0.16 270)",
  mistral: "oklch(60% 0.16 200)",
  xai: "oklch(60% 0.16 320)",
  deepseek: "oklch(60% 0.16 195)",
  qwen: "oklch(60% 0.16 130)",
  zhipu: "oklch(60% 0.16 160)",
  bytedance: "oklch(60% 0.16 50)",
  minimax: "oklch(60% 0.16 290)",
  xiaomi: "oklch(60% 0.16 80)",
  moonshot: "oklch(60% 0.16 220)",
};
const DEFAULT_COLOR = "oklch(55% 0.05 250)";

const W = 560;
const H = 320;
const PAD = { top: 24, right: 24, bottom: 40, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** log scale 映射。 */
function logScale(val, min, max, px) {
  const logMin = Math.log10(Math.max(min, 0.001));
  const logMax = Math.log10(max);
  const logVal = Math.log10(Math.max(val, 0.001));
  return ((logVal - logMin) / (logMax - logMin)) * px;
}

function costOf(m) {
  const c = m && m.aa && m.aa.costPerTask;
  return typeof c === "number" && c > 0 ? c : null;
}

export function ValueScatter({ items }) {
  const [hover, setHover] = useState(null);

  // 过滤有完整数据的点
  const points = (items || []).filter((m) => {
    const aa = m.aa;
    return (
      aa &&
      typeof aa.intelligenceIndex === "number" &&
      costOf(m) != null
    );
  });

  if (points.length === 0) return null;

  // 低 Cost/Task 且高智能 → 取 Index/Cost 最高的 Top 3 标名
  const top3 = points
    .map((m) => ({ id: m.id, name: m.name, ratio: m.aa.intelligenceIndex / costOf(m) }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map((t) => t.id);
  const top3Set = new Set(top3);

  const selected = compareList.value;

  // 动态范围
  const costs = points.map((m) => costOf(m));
  const indexes = points.map((m) => m.aa.intelligenceIndex);
  const pMin = Math.max(0.001, Math.min(...costs) * 0.7);
  const pMax = Math.max(...costs) * 1.3;
  const iMin = Math.max(0, Math.min(...indexes) - 5);
  const iMax = Math.max(...indexes) + 5;

  function toX(cost) {
    return PAD.left + logScale(cost, pMin, pMax, PLOT_W);
  }
  function toY(idx) {
    return PAD.top + PLOT_H - ((idx - iMin) / (iMax - iMin)) * PLOT_H;
  }

  // 网格线
  const yTicks = 4;
  const xTickVals = [0.01, 0.05, 0.1, 0.5, 1, 5, 10].filter((v) => v >= pMin && v <= pMax);

  return (
    <div class="ai-lb-scatter">
      <div class="ai-lb-scatter__header">
        <span class="ai-lb-scatter__title">价值散点 · 智能指数 × Cost per Task</span>
        <span class="ai-lb-scatter__hint">气泡＝模型 · 点击加入对比（最多 3 个）</span>
        <span class="ai-lb-scatter__hint">X 轴为 AA Free 官方 cost_per_task.total_cost</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="ai-lb-scatter__svg"
        role="img"
        aria-label="智能指数 vs Cost per Task 散点图"
      >
        {/* 高性价比区域背景（左上：低成本 + 高智能） */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W * 0.4}
          height={PLOT_H * 0.45}
          fill="color-mix(in oklch, var(--accent-primary) 5%, transparent)"
          rx="4"
        />

        {/* Y 网格 + 标签 */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = iMin + ((iMax - iMin) / yTicks) * i;
          const y = toY(val);
          return (
            <g key={`y${i}`}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border-light)" stroke-width="0.5" />
              <text x={PAD.left - 6} y={y + 3} text-anchor="end" class="ai-lb-scatter__label">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* X 网格 + 标签 */}
        {xTickVals.map((v) => {
          const x = toX(v);
          return (
            <g key={`x${v}`}>
              <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} stroke="var(--border-light)" stroke-width="0.5" />
              <text x={x} y={H - PAD.bottom + 14} text-anchor="middle" class="ai-lb-scatter__label">
                ${v}
              </text>
            </g>
          );
        })}

        {/* 轴标题 */}
        <text x={W / 2} y={H - 4} text-anchor="middle" class="ai-lb-scatter__axis">
          Cost per Task (USD)
        </text>
        <text x={12} y={H / 2} text-anchor="middle" class="ai-lb-scatter__axis" transform={`rotate(-90, 12, ${H / 2})`}>
          智能指数
        </text>

        {/* 数据点 */}
        {points.map((m) => {
          const cost = costOf(m);
          const x = toX(cost);
          const y = toY(m.aa.intelligenceIndex);
          const color = VENDOR_COLORS[m.vendor] || DEFAULT_COLOR;
          const isHover = hover === m.id;
          const isSelected = selected.includes(m.id);
          const isTop3 = top3Set.has(m.id);
          return (
            <g key={m.id}>
              {isSelected && (
                <circle cx={x} cy={y} r={9} fill="none" stroke="var(--accent-primary)" stroke-width="2" />
              )}
              <circle
                cx={x}
                cy={y}
                r={isHover ? 7 : 5}
                fill={color}
                opacity={isHover || isSelected ? 1 : 0.75}
                stroke={isHover ? "var(--text-primary)" : "none"}
                stroke-width={isHover ? 1.5 : 0}
                style={{ cursor: "pointer", transition: "r 0.1s ease" }}
                onMouseEnter={() => setHover(m.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => toggleCompare(m.id)}
              />
              {isTop3 && (
                <text
                  x={x + 8}
                  y={y - 6}
                  class="ai-lb-scatter__top3"
                >
                  {m.name.length > 18 ? m.name.slice(0, 18) + "…" : m.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Hover tooltip */}
        {hover && (() => {
          const m = points.find((p) => p.id === hover);
          if (!m) return null;
          const cost = costOf(m);
          const x = toX(cost);
          const y = toY(m.aa.intelligenceIndex);
          const costLabel = cost < 1 ? cost.toFixed(3) : cost.toFixed(2);
          const label = `${m.name} — ${m.aa.intelligenceIndex.toFixed(1)} / $${costLabel}`;
          const tx = Math.min(x + 10, W - 160);
          const ty = Math.max(y - 10, PAD.top + 12);
          return (
            <g>
              <rect x={tx - 4} y={ty - 12} width={label.length * 6.2 + 8} height={18} rx="3" fill="var(--surface)" stroke="var(--border)" stroke-width="0.5" />
              <text x={tx} y={ty} class="ai-lb-scatter__tooltip">{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export default ValueScatter;
