/**
 * VerdictCard — AI 解读卡 (左列主角).
 * 综合评级数字已在 hero 横幅显示, 这里只放 AI 解读标题 + summary.
 */
export function VerdictCard({ scores, aiResult }) {
  const overall = scores?.overall;
  return (
    <div class="verdict-card">
      <div class="verdict-title">🤖 AI 解读</div>
      <div class="verdict-summary">
        {aiResult?.summary || (overall == null ? "数据不足，无法生成评级解读。" : "AI 解读生成中…")}
      </div>
    </div>
  );
}

export default VerdictCard;
