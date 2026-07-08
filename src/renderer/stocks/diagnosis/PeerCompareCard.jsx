/**
 * PeerCompareCard — 同业对比独立卡片 (从 ModuleGrid 9-card 布局里凸显这一个角度).
 *
 * 之前把 peer_compare 的内容嵌进 FundamentalsCard / ValuationCard 的 sub-section (行业
 * 分位条), 用户反馈"看不到同业对比". 现在独立成 card, 让"同业对比"四个字 + 行业名
 * 直接可见. 数据来源仍是 peer_compare.data.
 *
 * ponytail: 同一份 peer_compare 数据, 不双渲染. FundamentalsCard/ValuationCard 里的
 * IndustryCompareBar sub-section 保留 (跟具体 card 的 PE/PB / ROE/毛利率上下文相关),
 * PeerCompareCard 额外加 4 维对比 (PE/PB 历史分位 + ROE/毛利率 vs 行业) + 行业标签.
 *
 * 数据缺失 (peer_compare failed) → 整 card 折叠到"数据不足", 不渲染空骨架.
 */
import { CardFreshness } from "./CardFreshness.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";
// IndustryCompareBar 用于 PE/PB 历史分位条. ROE/毛利率 vs 行业中位在 FundamentalsCard 里画.

export function PeerCompareCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  if (!d) {
    return (
      <div class="module-card module-card--peer-compare">
        <div class="module-card-title">
          <span>🔍 同业对比</span>
        </div>
        <div class="module-card-empty">数据不足</div>
      </div>
    );
  }
  // 只有跟"对比"相关的字段全部缺失时, 才显示空; 否则尽量少.
  const hasAny =
    d.pePercentile != null ||
    d.pbPercentile != null ||
    d.roeIndustryMedian != null ||
    d.grossMarginIndustryMedian != null;
  return (
    <div class="module-card module-card--peer-compare">
      <div class="module-card-title">
        <span>
          🔍 同业对比
          {d.industry ? <span class="peer-compare-industry"> · {d.industry}</span> : null}
        </span>
        <CardFreshness fetchedAt={fetchedAt} />
      </div>
      {!hasAny ? (
        <div class="module-card-empty">数据不足</div>
      ) : (
        <div class="module-card-body">
          {d.pePercentile != null && (
            <IndustryCompareBar
              label="PE 分位"
              percentile={d.pePercentile}
              higherIsBetter={false}
            />
          )}
          {d.pbPercentile != null && (
            <IndustryCompareBar
              label="PB 分位"
              percentile={d.pbPercentile}
              higherIsBetter={false}
            />
          )}
          {/* 标"估值较低/中等/较高" (peer_compare 拿到的中文状态, 帮助快速读) */}
          {(d.peValuationStatus || d.pbValuationStatus) && (
            <div class="peer-compare-status">
              {d.peValuationStatus && <span>PE {d.peValuationStatus}</span>}
              {d.peValuationStatus && d.pbValuationStatus && <span> · </span>}
              {d.pbValuationStatus && <span>PB {d.pbValuationStatus}</span>}
            </div>
          )}
          {/* 行业 ROE/毛利率中位: 本股的具体值在 FundamentalsCard 看, 这里只展示行业基准.
              保留两个简洁一行, 把"对比"留给 FundamentalsCard 里的行业分位条 (本股 vs 中位). */}
          {(d.roeIndustryMedian != null || d.grossMarginIndustryMedian != null) && (
            <div class="peer-compare-medians">
              {d.roeIndustryMedian != null && (
                <span class="peer-compare-median">
                  行业 ROE 中位 <strong>{d.roeIndustryMedian.toFixed(1)}%</strong>
                </span>
              )}
              {d.grossMarginIndustryMedian != null && (
                <span class="peer-compare-median">
                  行业毛利率中位 <strong>{d.grossMarginIndustryMedian.toFixed(1)}%</strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PeerCompareCard;