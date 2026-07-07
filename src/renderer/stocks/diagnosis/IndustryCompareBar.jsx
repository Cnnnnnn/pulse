/**
 * IndustryCompareBar — 横向分位条, "本股 vs 行业中位" 一行直观对比.
 *
 * ponytail: 2026-07-07 — 不引图表库. 一段 flex 横条 + 颜色分段够用.
 *
 * 数据来源: peer_compare.data.roeIndustryMedian / grossMarginIndustryMedian /
 * pePercentile (0-100) / pbPercentile (0-100).
 *
 * 模式:
 *   - 给定 percentile (0-100): 一根进度条 + 当前位置标记 (历史分位用).
 *   - 给定 industry (绝对数): 本股 vs 行业中位 (盈利能力对比用).
 *   - 数据都不够: 返回 null.
 */
const fmtNum = (v, digits = 1) => (v == null ? "—" : v.toFixed(digits));

export function IndustryCompareBar({
  label,
  mine,
  industry,
  percentile,
  higherIsBetter,
  formatMine,
  formatIndustry,
}) {
  const fmtVal = formatMine || ((v) => fmtNum(v));
  const fmtInd = formatIndustry || fmtVal;

  // 分位模式 (历史 PE/PB 分位): 0-100 进度条, 颜色按方向
  if (percentile != null) {
    const p = Math.max(0, Math.min(100, percentile));
    const cls =
      higherIsBetter === false
        ? p >= 70 ? "cautious" : p <= 30 ? "positive" : "neutral"
        : "neutral";
    return (
      <div class={`ind-compare ind-compare-pct ind-compare-${cls}`}>
        <span class="ind-compare-label">{label}</span>
        <div class="ind-compare-track">
          <div class="ind-compare-fill" style={{ width: `${p}%` }} />
          <div class="ind-compare-mark" style={{ left: `${p}%` }} />
        </div>
        <span class="ind-compare-val">历史 {p.toFixed(0)}% 分位</span>
      </div>
    );
  }

  // 绝对值模式 (本股 vs 行业中位)
  if (mine == null && industry == null) return null;
  const t = (() => {
    if (mine == null || industry == null) return "neutral";
    if (higherIsBetter) return mine >= industry ? "positive" : "cautious";
    return mine <= industry ? "positive" : "cautious";
  })();
  const delta = (mine != null && industry != null && industry !== 0)
    ? ((mine - industry) / Math.abs(industry)) * 100
    : null;
  const deltaStr = delta == null
    ? null
    : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  // ratio = mine/industry, clamp 到 [0, 2]; 进度条按 ratio/2 渲染 (50% = 行业中位)
  const ratio = (mine != null && industry != null && industry !== 0)
    ? Math.max(0, Math.min(2, mine / industry))
    : null;
  const widthPct = ratio == null ? 0 : Math.min(100, (ratio / 2) * 100);
  return (
    <div class={`ind-compare ind-compare-abs ind-compare-${t}`}>
      <span class="ind-compare-label">{label}</span>
      <div class="ind-compare-row">
        <span class="ind-compare-mine">{fmtVal(mine)}</span>
        <div class="ind-compare-track">
          <div class="ind-compare-fill" style={{ width: `${widthPct}%` }} />
          {ratio != null && (
            <div class="ind-compare-midmark" style={{ left: "50%" }} title={`行业中位 ${fmtInd(industry)}`} />
          )}
        </div>
        <span class="ind-compare-ind">行业中位 {fmtInd(industry)}</span>
      </div>
      {deltaStr && (
        <div class="ind-compare-delta">{deltaStr} vs 行业</div>
      )}
    </div>
  );
}

export default IndustryCompareBar;