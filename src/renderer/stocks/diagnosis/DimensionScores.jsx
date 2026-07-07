/**
 * DimensionScores — 五维评分柱状.
 *
 * 评分柱状: 颜色按 绿(≥7) / 蓝(≥5) / 橙(≥3) / 红(<3); 数据缺失(null) → 灰色虚线占位 + "—".
 *
 * ponytail: 2026-07-07 — 5 维评分只看"分数", 不接 AI 解读行. AI 解读已经分布在
 * ModuleGrid 各 card 的 AiNoteLine 上, 这里再嵌一行只是视觉冗余 + 文本截断噪声
 * (用户反馈 "0510" 之类残影). DIM_TO_AI_KEY 不再需要, 一并删.
 */
const DIMS = [
  ["fundamental", "基本面"],
  ["valuation", "估值"],
  ["capital", "资金"],
  ["tech", "技术"],
  ["risk", "风险"],
];
const COLOR = (s) => (s == null ? "#d8d8de" : s >= 7 ? "#34c759" : s >= 5 ? "#007aff" : s >= 3 ? "#ff9500" : "#ff3b30");

export function DimensionScores({ scores }) {
  const dims = scores?.dimensions || {};
  return (
    <div class="dimension-scores">
      <div class="dimension-scores-bars">
        {DIMS.map(([k, label]) => {
          const s = dims[k];
          const missing = s == null;
          const h = missing ? 0 : Math.max(6, s * 10);
          return (
            <div class={`dim-col ${missing ? "dim-col-missing" : ""}`} key={k}>
              <div class="dim-label-top">{label}</div>
              <div class="dim-bar-track">
                <div class="dim-bar-fill" style={{ height: `${h}%`, background: COLOR(s) }} />
                {missing && <div class="dim-bar-missing">—</div>}
              </div>
              <div class="dim-score" style={{ color: COLOR(s) }}>{missing ? "—" : s}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DimensionScores;
