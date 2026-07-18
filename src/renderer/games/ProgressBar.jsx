/**
 * src/renderer/games/ProgressBar.jsx
 *
 * 通用进度条（收集进度可视化用）。
 * - 仅在 percent 有效（0–100）时渲染填充，否则不渲染比例（P0-1：不设目标不渲染%）。
 * - 数值 tabular-nums；对比度 ≥ 3:1（用语义令牌，深色主题经系统校验）。
 * - 尊重 prefers-reduced-motion。
 */

/**
 * @param {object} props
 * @param {number} [props.percent] 0–100；传 null/undefined 表示「不显示进度比例」。
 * @param {string} [props.label] 进度条旁的说明文字（如 "4 / 10"）。
 * @param {boolean} [props.showRatio] 是否在 aria-label 中读出百分比。
 */
export function ProgressBar({ percent, label, showRatio = true }) {
  const hasRatio = typeof percent === "number" && Number.isFinite(percent);
  const clamped = hasRatio ? Math.max(0, Math.min(100, percent)) : 0;
  const width = `${clamped}%`;

  const ariaLabel = hasRatio
    ? `${label ? label + "，" : ""}进度 ${Math.round(clamped)}%`
    : (label || "进度");

  return (
    <div
      class="collection-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={hasRatio && showRatio ? Math.round(clamped) : undefined}
      aria-label={ariaLabel}
    >
      <div
        class="collection-progress__fill"
        style={hasRatio ? { width } : { width: "0%" }}
      />
    </div>
  );
}

export default ProgressBar;
