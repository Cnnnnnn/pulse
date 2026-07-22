/**
 * src/renderer/games/CompletionRing.jsx
 *
 * 完成度环形进度（SVG）。仅动画 transform/opacity，GPU 友好；
 * 尊重 prefers-reduced-motion（由外部传入 reducedMotion 或 CSS 媒体查询降级）。
 *
 * 可访问性：role="img" + aria-label 描述完成度；数值 tabular-nums。
 * 纯展示组件，不持有状态。
 */
import { clampPct } from "./collectionRegistry.js";

/**
 * @param {object} props
 * @param {number} props.pct   完成度 [0..1]
 * @param {number} [props.size=120]   直径(px)
 * @param {number} [props.stroke=10]   环宽(px)
 * @param {string} [props.accent="var(--accent-primary)"]  进度色（令牌/oklch）
 * @param {string} [props.label]   中心主文（如 "62%"）
 * @param {string} [props.sublabel]   中心副文（如 "已分级 31/50"）
 * @param {boolean} [props.reducedMotion=false]
 */
export function CompletionRing({
  pct = 0,
  size = 120,
  stroke = 10,
  accent = "var(--accent-primary)",
  label,
  sublabel,
  reducedMotion = false,
}) {
  const p = clampPct(pct);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p);
  const center = size / 2;
  const ringLabel = label != null ? label : `${Math.round(p * 100)}%`;

  return (
    <div
      class={`completion-ring${reducedMotion ? " is-reduced" : ""}`}
      style={`--ring-size:${size}px;--ring-stroke:${stroke}px;--ring-accent:${accent}`}
      role="img"
      aria-label={`完成度 ${Math.round(p * 100)}%${sublabel ? `，${sublabel}` : ""}`}
    >
      <svg
        class="completion-ring__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          class="completion-ring__track"
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke-width={stroke}
        />
        <circle
          class="completion-ring__fill"
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div class="completion-ring__center">
        <span class="completion-ring__pct">{ringLabel}</span>
        {sublabel && <span class="completion-ring__sub">{sublabel}</span>}
      </div>
    </div>
  );
}

export default CompletionRing;
