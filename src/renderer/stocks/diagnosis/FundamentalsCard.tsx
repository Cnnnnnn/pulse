import { ModuleCard } from "./ModuleCard.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";

// ponytail: 2026-07-07 — 主体加 IndustryCompareBar:
//   ROE / 毛利率 vs 行业中位 (peer_compare.data.roeIndustryMedian /
//   grossMarginIndustryMedian). peerCompare 缺数据时整段隐藏.

// ponytail 2026-07-18 P0-1 T8: 透传 angle + onRefresh 给 ModuleCard,
//   ModuleCard 自动渲 DataHealthPill (4 态 + failed 重试按钮).
export function FundamentalsCard({ data, peerCompare, angle = null, onRefresh = null }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  const showRoe = peerCompare && peerCompare.roeIndustryMedian != null && d?.roe != null;
  const showMargin = peerCompare && peerCompare.grossMarginIndustryMedian != null && d?.grossMargin != null;
  return (
    <ModuleCard
      variant="fundamentals"
      title="📊 基本面"
      angle={angle}
      onRefresh={onRefresh}
      fetchedAt={fetchedAt}
      body={d ? (
        <div class="module-card-body">
          <div>ROE {d.roe ?? "—"}%</div>
          <div>毛利率 {d.grossMargin ?? "—"}%</div>
          <div>净利率 {d.netMargin ?? "—"}%</div>
          {(showRoe || showMargin) && (
            <div class="module-card-sub">
              {showRoe && (
                <IndustryCompareBar
                  label="ROE"
                  mine={d.roe}
                  industry={peerCompare.roeIndustryMedian}
                  higherIsBetter
                />
              )}
              {showMargin && (
                <IndustryCompareBar
                  label="毛利率"
                  mine={d.grossMargin}
                  industry={peerCompare.grossMarginIndustryMedian}
                  higherIsBetter
                />
              )}
            </div>
          )}
        </div>
      ) : null}
      empty="数据不足"
    />
  );
}

export default FundamentalsCard;
