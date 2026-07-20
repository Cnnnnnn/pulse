/**
 * src/renderer/ai-leaderboard/SampleBadge.jsx — 「示例」徽标。
 * 复用 design-system Badge 令牌（语义色，禁用裸 hex）；
 * 行内 / 独立两种尺寸（small 用于表格单元格内联）。
 */
export function SampleBadge({ small = false }) {
  return (
    <span
      class={`ai-lb-sample-badge${small ? " ai-lb-sample-badge--sm" : ""}`}
      title="示例数据（离线快照，非实时）"
      aria-label="示例数据"
    >
      示例
    </span>
  );
}

export default SampleBadge;
