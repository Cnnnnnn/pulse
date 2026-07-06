/**
 * DimensionScores — 五维评分对比柱状图.
 * 柱高 = 分数×10% (满分 10 → 满高). 颜色按强弱: 绿(≥7)/蓝(≥5)/橙(≥3)/红(<3).
 * 数据缺失(null) 显示短灰柱 + "—".
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
          const h = s == null ? 6 : Math.max(6, s * 10); // 最小 6px 占位
          return (
            <div class="dim-col" key={k}>
              <div class="dim-label-top">{label}</div>
              <div class="dim-bar-track">
                <div class="dim-bar-fill" style={{ height: `${h}%`, background: COLOR(s) }} />
              </div>
              <div class="dim-score" style={{ color: COLOR(s) }}>{s == null ? "—" : s}</div>
            </div>
          );
        })}
      </div>
      <div class="dimension-scores-scale">
        <span>0</span><span>5</span><span>10</span>
      </div>
    </div>
  );
}

export default DimensionScores;
