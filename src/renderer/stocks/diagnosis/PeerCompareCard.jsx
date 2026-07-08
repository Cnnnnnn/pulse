import { ModuleCard } from "./ModuleCard.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";

/**
 * PeerCompareCard — 同业对比独立卡片 (从 ModuleGrid 9-card 布局里凸显这一个角度).
 *
 * 同一份 peer_compare 数据, 不双渲染. FundamentalsCard/ValuationCard 里的
 * IndustryCompareBar sub-section 保留 (跟具体 card 的 PE/PB / ROE/毛利率上下文相关),
 * PeerCompareCard 额外加 4 维对比 (PE/PB 历史分位 + ROE/毛利率 vs 行业) + 行业标签.
 *
 * 数据缺失 (peer_compare failed) → 整 card 折叠到"数据不足", 不渲染空骨架.
 */

export function PeerCompareCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  const hasAny =
    d && (
      d.pePercentile != null ||
      d.pbPercentile != null ||
      d.roeIndustryMedian != null ||
      d.grossMarginIndustryMedian != null
    );
  const titleExtra = d && d.industry ? (
    <span class="peer-compare-industry"> · {d.industry}</span>
  ) : null;
  return (
    <ModuleCard
      variant="peer-compare"
      title="🔍 同业对比"
      titleExtra={titleExtra}
      fetchedAt={fetchedAt}
      body={!d ? null : (!hasAny ? null : (
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
          {(d.peValuationStatus || d.pbValuationStatus) && (
            <div class="peer-compare-status">
              {d.peValuationStatus && <span>PE {d.peValuationStatus}</span>}
              {d.peValuationStatus && d.pbValuationStatus && <span> · </span>}
              {d.pbValuationStatus && <span>PB {d.pbValuationStatus}</span>}
            </div>
          )}
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
      ))}
      empty="数据不足"
    />
  );
}

export default PeerCompareCard;
