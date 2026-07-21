/**
 * src/renderer/ai-leaderboard/CrossSourceRadar.jsx
 *
 * 跨源雷达（Cross-Source Radar）：同一批「厂商（实验室）」在三个独立评测源上的能力叠加对比。
 *   轴 0（顶部）：Arena ELO（社区盲测，取该厂商最高分）
 *   轴 1（右下）：AA 智能指数（Artificial Analysis 客观）
 *   轴 2（左下）：LiveBench Overall（抗污染客观）
 *
 * 为何按厂商而非按模型：三源模型 id 命名体系不一致，精确 id 合并后三源几乎零交集
 * （实测 465 个模型无任何一个同时具备三切片）。厂商名三源一致（normalizeVendor 归一），
 * 故按厂商聚合（每个厂商取各源最佳切片）可靠对齐，规避模糊匹配的误并风险。
 *
 * 每轴固定量纲域绝对归一（见 format.js 的 ELO_MIN/MAX、AA_IDX_MAX、LB_MAX）。
 * 厂商若仅部分源有数据，则按可用轴绘制（缺轴顶点落在中心，图例标注缺失源）；
 * 选中模型所属厂商高亮（focus），其余为基准对比上下文。
 *
 * 纯渲染层：仅依赖 profiles 数组与 format.js 纯函数，零 store 依赖。
 * 颜色仅 oklch / var / color-mix。
 */

import { useState } from "preact/hooks";
import {
  normalizeToUnit,
  ELO_MIN,
  ELO_MAX,
  AA_IDX_MAX,
  LB_MAX,
  fmtScore,
  fmtIndex,
  fmtLivebench,
  fmtVendor,
} from "./format.js";
import { VENDOR_META } from "./types.js";

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

export function CrossSourceRadar({ profiles = [] }) {
  const [hover, setHover] = useState(null);

  // 计算每个厂商的归一化轮廓 + 收集可用轴 / 缺失轴
  const plotted = [];
  const nodata = [];
  for (const p of profiles) {
    const norm = {
      arena: normalizeToUnit(p.arena, ELO_MIN, ELO_MAX),
      aa: normalizeToUnit(p.aa, 0, AA_IDX_MAX),
      livebench: normalizeToUnit(p.livebench, 0, LB_MAX),
    };
    const avail = AXES.map((ax, i) => (norm[ax.key] != null ? i : -1)).filter((i) => i >= 0);
    if (avail.length === 0) {
      nodata.push(fmtVendor(p.vendor));
      continue;
    }
    const miss = AXES.filter((_, i) => !avail.includes(i)).map((ax) => ax.label);
    plotted.push({
      vendor: p.vendor,
      label: fmtVendor(p.vendor),
      raw: { arena: p.arena, aa: p.aa, livebench: p.livebench },
      norm,
      avail,
      miss,
      focus: !!p.focus,
      color: VENDOR_COLORS[p.vendor] || DEFAULT_COLOR,
    });
  }

  if (plotted.length === 0) {
    return (
      <div class="ai-lb-radar ai-lb-radar--empty">
        <p class="ai-lb-radar__empty">
          所选/基准厂商均缺少跨源数据（需至少具备 Arena / AA / LiveBench 之一）。
          {nodata.length > 0 && (
            <span>
              {" "}
              无数据：{nodata.join("、")}
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
        <span class="ai-lb-radar__title">跨源雷达 · 同厂商跨 Arena / AA / LiveBench</span>
        <span class="ai-lb-radar__hint">三轴固定量纲归一，外圈＝满分；多边形越外扩＝综合越强</span>
      </div>

      <div class="ai-lb-radar__body">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          class="ai-lb-radar__svg"
          role="img"
          aria-label="跨源能力雷达图（按厂商）"
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

          {/* 厂商多边形（含 spoke 与可用轴顶点） */}
          {plotted.map((p) => {
            const isHover = hover === p.vendor;
            const strokeW = p.focus ? (isHover ? 3 : 2.4) : isHover ? 2 : 1.4;
            const fillOp = p.focus ? (isHover ? 0.3 : 0.16) : isHover ? 0.18 : 0.07;
            // 仅当有 ≥2 个可用轴时绘制闭合多边形
            const d =
              p.avail.length >= 2
                ? p.avail
                    .map((i) => {
                      const [x, y] = pt(i, p.norm[AXES[i].key]);
                      return `${p.avail[0] === i ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(" ") + " Z"
                : null;
            return (
              <g
                key={p.vendor}
                onMouseEnter={() => setHover(p.vendor)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                {/* spoke：从中心到每个可用轴顶点 */}
                {p.avail.map((i) => {
                  const [x, y] = pt(i, p.norm[AXES[i].key]);
                  return (
                    <line
                      key={`s${i}`}
                      x1={CX}
                      y1={CY}
                      x2={x}
                      y2={y}
                      stroke={p.color}
                      stroke-width={p.focus ? 1 : 0.6}
                      stroke-opacity={isHover ? 0.9 : 0.5}
                    />
                  );
                })}
                {d && (
                  <path
                    d={d}
                    fill={p.color}
                    fill-opacity={fillOp}
                    stroke={p.color}
                    stroke-width={strokeW}
                    style={{ transition: "fill-opacity 0.12s ease, stroke-width 0.12s ease" }}
                  />
                )}
                {p.avail.map((i) => {
                  const [x, y] = pt(i, p.norm[AXES[i].key]);
                  return <circle key={`c${i}`} cx={x} cy={y} r={isHover ? 3.2 : 2.4} fill={p.color} />;
                })}
              </g>
            );
          })}
        </svg>

        {/* 图例 + 原始值 */}
        <ul class="ai-lb-radar__legend">
          {plotted.map((p) => (
            <li
              key={p.vendor}
              class={`ai-lb-radar__legend-item${p.focus ? " is-focus" : ""}${p.miss.length ? " is-partial" : ""}${hover === p.vendor ? " is-hover" : ""}`}
              onMouseEnter={() => setHover(p.vendor)}
              onMouseLeave={() => setHover(null)}
            >
              <span class="ai-lb-radar__swatch" style={{ background: p.color }} />
              <span class="ai-lb-radar__name">{p.label}</span>
              {p.focus && <span class="ai-lb-radar__tag">已选</span>}
              <span class="ai-lb-radar__vals">
                ELO {fmtAxisVal("arena", p.raw.arena)} · AA {fmtAxisVal("aa", p.raw.aa)} · LB{" "}
                {fmtAxisVal("livebench", p.raw.livebench)}
              </span>
              {p.miss.length > 0 && <span class="ai-lb-radar__miss">缺 {p.miss.join("/")}</span>}
            </li>
          ))}
          {nodata.length > 0 && (
            <li class="ai-lb-radar__legend-item is-missing">
              <span class="ai-lb-radar__name">无跨源数据</span>
              <span class="ai-lb-radar__vals">{nodata.join("、")}</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default CrossSourceRadar;
