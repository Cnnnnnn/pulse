/**
 * src/renderer/ai-leaderboard/ArenaBubbleChart.jsx
 *
 * v3.x Arena 视角气泡图（ELO × 票数，气泡＝置信区间 CI）。
 * X 轴：ELO 分数（线性）
 * Y 轴：票数（log scale，跨度大）
 * 气泡大小：置信区间 CI —— CI 越大代表该 ELO 估计越不确定，气泡越大即「不确定性光晕」。
 *
 * 与 ValueScatter 同一范式：纯 SVG、厂商色板、hover/选中/Top3 标记、
 * 点击加入对比（toggleCompare）、颜色仅用 oklch/var/color-mix。
 *
 * 纯渲染层，零数据层依赖：数据来自 model.arena[board] 的 {score, votes, ci}。
 */

import { useState } from "preact/hooks";
import { toggleCompare, compareList } from "./aiLeaderboardStore.js";

// 厂商 → 气泡颜色（与 ValueScatter 一致）
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
const H = 340;
const PAD = { top: 24, right: 24, bottom: 42, left: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** log scale 映射（票数范围，下限保护 1）。 */
function logScale(val, min, max, px) {
  const logMin = Math.log10(Math.max(min, 1));
  const logMax = Math.log10(Math.max(max, 2));
  const logVal = Math.log10(Math.max(val, 1));
  return ((logVal - logMin) / (logMax - logMin)) * px;
}

/** CI → 气泡半径（CI 越大越不确定，气泡越大）。 */
function ciToRadius(ci, maxCi) {
  if (!Number.isFinite(ci) || ci <= 0) return 5;
  if (maxCi <= 0) return 5;
  const t = Math.min(1, ci / maxCi);
  return 5 + t * 11; // 5 ~ 16
}

export function ArenaBubbleChart({ items, board }) {
  const [hover, setHover] = useState(null);

  const boardKey = typeof board === "string" ? board : board && board.key;

  // 取当前 board 的 {score, votes, ci}
  const points = (items || []).filter((m) => {
    const s = m && m.arena && boardKey && m.arena[boardKey];
    return (
      s &&
      typeof s.score === "number" &&
      typeof s.votes === "number" &&
      s.votes > 0 &&
      typeof s.ci === "number"
    );
  });

  if (points.length === 0) return null;

  // 动态范围
  const scores = points.map((m) => m.arena[boardKey].score);
  const votes = points.map((m) => m.arena[boardKey].votes);
  const cis = points.map((m) => m.arena[boardKey].ci);
  const sMin = Math.max(0, Math.min(...scores) - 20);
  const sMax = Math.max(...scores) + 20;
  const vMin = Math.max(1, Math.min(...votes) * 0.6);
  const vMax = Math.max(...votes) * 1.4;
  const maxCi = Math.max(...cis);

  // Top3 by ELO
  const top3 = points
    .map((m) => ({ id: m.id, score: m.arena[boardKey].score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((t) => t.id);
  const top3Set = new Set(top3);

  const selected = compareList.value;

  function toX(score) {
    return PAD.left + ((score - sMin) / (sMax - sMin)) * PLOT_W;
  }
  function toY(v) {
    return PAD.top + PLOT_H - logScale(v, vMin, vMax, PLOT_H);
  }

  // 强势区：右上（高 ELO + 高票数）
  const strongX = PAD.left + PLOT_W * 0.62;
  const strongY = PAD.top;
  const strongW = PLOT_W - (strongX - PAD.left);
  const strongH = PLOT_H * 0.5;

  // Y 网格（log 刻度）
  const yTickVals = [1, 10, 100, 1000, 10000, 100000]
    .filter((v) => v >= vMin && v <= vMax);
  // X 网格（线性）
  const xTicks = 4;

  return (
    <div class="ai-lb-bubble">
      <div class="ai-lb-bubble__header">
        <span class="ai-lb-bubble__title">竞技场气泡 · ELO × 票数（气泡＝置信区间）</span>
        <span class="ai-lb-bubble__hint">气泡越大＝CI 越宽（估计越不确定）· 点击加入对比（最多 3 个）</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="ai-lb-bubble__svg"
        role="img"
        aria-label="ELO 分数 vs 票数 气泡图"
      >
        {/* 强势区高亮 */}
        <rect
          x={strongX}
          y={strongY}
          width={strongW}
          height={strongH}
          fill="color-mix(in oklch, var(--accent-primary) 5%, transparent)"
          rx="4"
        />
        <text x={strongX + 6} y={strongY + 14} class="ai-lb-bubble__zone">
          强势区
        </text>

        {/* Y 网格 + 标签（log） */}
        {yTickVals.map((v) => {
          const y = toY(v);
          return (
            <g key={`y${v}`}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border-light)" stroke-width="0.5" />
              <text x={PAD.left - 6} y={y + 3} text-anchor="end" class="ai-lb-bubble__label">
                {v >= 1000 ? `${v / 1000}k` : v}
              </text>
            </g>
          );
        })}

        {/* X 网格 + 标签（线性） */}
        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const val = sMin + ((sMax - sMin) / xTicks) * i;
          const x = toX(val);
          return (
            <g key={`x${i}`}>
              <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} stroke="var(--border-light)" stroke-width="0.5" />
              <text x={x} y={H - PAD.bottom + 14} text-anchor="middle" class="ai-lb-bubble__label">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* 轴标题 */}
        <text x={W / 2} y={H - 4} text-anchor="middle" class="ai-lb-bubble__axis">
          ELO 分数
        </text>
        <text x={12} y={H / 2} text-anchor="middle" class="ai-lb-bubble__axis" transform={`rotate(-90, 12, ${H / 2})`}>
          票数（log）
        </text>

        {/* 数据点（气泡） */}
        {points.map((m) => {
          const s = m.arena[boardKey];
          const x = toX(s.score);
          const y = toY(s.votes);
          const r = ciToRadius(s.ci, maxCi);
          const color = VENDOR_COLORS[m.vendor] || DEFAULT_COLOR;
          const isHover = hover === m.id;
          const isSelected = selected.includes(m.id);
          const isTop3 = top3Set.has(m.id);
          return (
            <g key={m.id}>
              {isSelected && (
                <circle cx={x} cy={y} r={r + 3} fill="none" stroke="var(--accent-primary)" stroke-width="2" />
              )}
              <circle
                cx={x}
                cy={y}
                r={isHover ? r + 1.5 : r}
                fill={color}
                opacity={isHover || isSelected || isTop3 ? 1 : 0.7}
                stroke={isHover ? "var(--text-primary)" : "none"}
                stroke-width={isHover ? 1.5 : 0}
                style={{ cursor: "pointer", transition: "r 0.1s ease" }}
                onMouseEnter={() => setHover(m.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => toggleCompare(m.id)}
              />
              {isTop3 && (
                <text x={x + r + 3} y={y - 2} class="ai-lb-bubble__top3">
                  {m.name.length > 16 ? m.name.slice(0, 16) + "…" : m.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Hover tooltip */}
        {hover && (() => {
          const m = points.find((p) => p.id === hover);
          if (!m) return null;
          const s = m.arena[boardKey];
          const label = `${m.name} — ELO ${Math.round(s.score)} · ${s.votes.toLocaleString()} 票 · CI ±${Math.round(s.ci)}`;
          const x = toX(s.score);
          const y = toY(s.votes);
          const tx = Math.min(x + 10, W - label.length * 6.2 - 12);
          const ty = Math.max(y - 10, PAD.top + 12);
          return (
            <g>
              <rect
                x={tx - 4}
                y={ty - 12}
                width={label.length * 6.2 + 8}
                height={18}
                rx="3"
                fill="var(--surface)"
                stroke="var(--border)"
                stroke-width="0.5"
              />
              <text x={tx} y={ty} class="ai-lb-bubble__tooltip">{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export default ArenaBubbleChart;
