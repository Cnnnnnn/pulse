const RATING_LABEL = (s) => (s == null ? "数据不足" : s >= 7.5 ? "强烈" : s >= 6 ? "中性偏强" : s >= 4 ? "中性" : "偏弱");

export function VerdictCard({ scores, aiResult }) {
  const overall = scores?.overall;
  return (
    <div class="verdict-card">
      <div class="verdict-rating">
        <span class="verdict-score">
          {overall == null ? "—" : overall}
          <span class="verdict-max">/10</span>
        </span>
        <div class="verdict-label-wrap">
          <span class="verdict-label">{RATING_LABEL(overall)}</span>
          <span class="verdict-sub">综合评级</span>
        </div>
      </div>
      <div class="verdict-summary">
        {aiResult?.summary || (overall == null ? "数据不足，无法生成评级" : "AI 解读生成中…")}
      </div>
    </div>
  );
}

export default VerdictCard;
