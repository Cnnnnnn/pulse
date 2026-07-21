/**
 * src/renderer/ai-leaderboard/CrossSourceRadar.jsx
 *
 * 跨源雷达（Cross-Source Radar）：同一批模型在三个独立评测源上的能力叠加对比。
 *   轴 0（顶部）：Arena ELO（社区盲测）
 *   轴 1（右下）：AA 智能指数（Artificial Analysis 客观）
 *   轴 2（左下）：LiveBench Overall（抗污染客观）
 *
 * 每轴固定量纲域绝对归一（见 format.js 的 ELO_MIN/MAX、AA_IDX_MAX、LB_MAX），
 * 便于跨模型横向比较，而非相对拉伸。任一轴缺失的模型不参与多边形，列入「数据不全」。
 *
 * 纯渲染层：仅依赖 model.arena/aa/livebench 切片与 format.js 纯函数，零 store 依赖。
 * 颜色仅 oklch / var / color-mix。
 */

import { useState } from "preact/hooks";
import {
  crossSourceProfile,
  normalizeToUnit,
  ELO_MIN,
  ELO_MAX,
  AA_IDX_MAX,
  LB_MAX,
  fmtScore,
  fmtIndex,
  fmtLivebench,
} from "./format.js";

// 厂商 → 雷达颜色（与 ValueScatter / ArenaBubbleChart 同一套色板）
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

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 48; // 留白给轴标签

// 三轴角度（SVG：y 向下，故 -90°=正上）
const AXES = [
  { key: "arena", label: "Arena ELO" },
  { key: "aa", label: "AA 智能" },
  { key: "livebench", label: "LiveBench" },
];
const AXIS_ANGLES = [-90, 30, 150];

function pt(axisIdx, t) {
  const a = (AXIS_ANGLES[axisIdx] * Math.PI) / 180;
  return [CX + R * t * Math.cos(a), CY + R * t * Math.sin(a)];
}

function fmtAxisVal(key, v) {
  if (v == null) return "—";
  if (key === "arena") return fmtScore(v);
  if (key === "aa") return fmtIndex(v);
  return fmtLivebench(v);
}

export function CrossSourceRadar({ models = [] }) {
  const [hover, setHover] = useState(null);

  // 计算每模型的归一化轮廓 + 收集缺失轴
  const plotted = [];
  const missing = [];
  for (const m of models) {
    const raw = crossSourceProfile(m);
    const norm = {
      arena: normalizeToUnit(raw.arena, ELO_MIN, ELO_MAX),
      aa: normalizeToUnit(raw.aa, 0, AA_IDX_MAX),
      livebench: normalizeToUnit(raw.livebench, 0, LB_MAX),
    };
    if (norm.arena == null || norm.aa == null || norm.livebench == null) {
      const miss = [];
      if (norm.arena == null) miss.push("Arena");
      if (norm.aa == null) miss.push("AA");
      if (norm.livebench == null) miss.push("LiveBench");
      missing.push({ name: m.name, miss });
      continue;
    }
    plotted.push({
      id: m.id,
      name: m.name,
      raw,
      norm,
      color: VENDOR_COLORS[m.vendor] || DEFAULT_COLOR,
    });
  }

  if (plotted.length === 0) {
    return (
      <div class="ai-lb-radar ai-lb-radar--empty">
        <p class="ai-lb-radar__empty">
          所选模型缺少跨源数据（需同时具备 Arena / AA / LiveBench 三项）。
          {missing.length > 0 && (
            <span>
              {" "}
              缺失：
              {missing.map((x) => `${x.name}（缺${x.miss.join("/")}）`).join("； ")}
            </span>
          )}
        </p>
      </div>
    );
  }

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPath = (t) =>
    AXES.map((_, i) => {
      const [x, y] = pt(i, t);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ") + " Z";

  return (
    <div class="ai-lb-radar">
      <div class="ai-lb-radar__header">
        <span class="ai-lb-radar__title">跨源雷达 · Arena / AA / LiveBench</span>
        <span class="ai-lb-radar__hint">三轴固定量纲归一，外圈＝满分；多边形越外扩＝综合越强</span>
      </div>

      <div class="ai-lb-radar__body">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          class="ai-lb-radar__svg"
          role="img"
          aria-label="跨源能力雷达图"
        >
          {/* 网格环 */}
          {rings.map((t) => (
            <path
              key={t}
              d={ringPath(t)}
              fill="none"
              stroke="var(--border-light)"
              stroke-width={t === 1 ? 1 : 0.5}
            />
          ))}

          {/* 轴线 + 轴标签 */}
          {AXES.map((axis, i) => {
            const [ex, ey] = pt(i, 1);
            const [lx, ly] = pt(i, 1.16);
            const anchor = i === 0 ? "middle" : i === 1 ? "start" : "end";
            return (
              <g key={axis.key}>
                <line x1={CX} y1={CY} x2={ex} y2={ey} stroke="var(--border)" stroke-width="0.75" />
                <text x={lx} y={ly + 3} text-anchor={anchor} class="ai-lb-radar__axis">
                  {axis.label}
                </text>
              </g>
            );
          })}

          {/* 模型多边形 */}
          {plotted.map((p) => {
            const isHover = hover === p.id;
            const d = AXES.map((_, i) => {
              const [x, y] = pt(i, p.norm[AXES[i].key]);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
            }).join(" ") + " Z";
            return (
              <g key={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
                <path
                  d={d}
                  fill={p.color}
                  fill-opacity={isHover ? 0.28 : 0.14}
                  stroke={p.color}
                  stroke-width={isHover ? 2.4 : 1.6}
                  style={{ cursor: "pointer", transition: "fill-opacity 0.12s ease, stroke-width 0.12s ease" }}
                />
                {AXES.map((axis, i) => {
                  const [x, y] = pt(i, p.norm[axis.key]);
                  return <circle key={i} cx={x} cy={y} r={isHover ? 3.2 : 2.4} fill={p.color} />;
                })}
              </g>
            );
          })}
        </svg>

        {/* 图例 + 原始值 */}
        <ul class="ai-lb-radar__legend">
          {plotted.map((p) => (
            <li
              key={p.id}
              class={`ai-lb-radar__legend-item${hover === p.id ? " is-hover" : ""}`}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
            >
              <span class="ai-lb-radar__swatch" style={{ background: p.color }} />
              <span class="ai-lb-radar__name">{p.name}</span>
              <span class="ai-lb-radar__vals">
                ELO {fmtAxisVal("arena", p.raw.arena)} · AA {fmtAxisVal("aa", p.raw.aa)} · LB{" "}
                {fmtAxisVal("livebench", p.raw.livebench)}
              </span>
            </li>
          ))}
          {missing.map((x) => (
            <li key={x.name} class="ai-lb-radar__legend-item is-missing">
              <span class="ai-lb-radar__name">{x.name}</span>
              <span class="ai-lb-radar__vals">缺 {x.miss.join("/")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default CrossSourceRadar;
