// ponytail: 2026-07-07 — 标题区右侧加 CardFreshness; 主体加 IndustryCompareBar:
//   ROE / 毛利率 vs 行业中位 (peer_compare.data.roeIndustryMedian /
//   grossMarginIndustryMedian). peerCompare 缺数据时整段隐藏.
import { CardFreshness } from "./CardFreshness.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";

export function FundamentalsCard({ data, peerCompare }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  const showRoe = peerCompare && peerCompare.roeIndustryMedian != null && d?.roe != null;
  const showMargin = peerCompare && peerCompare.grossMarginIndustryMedian != null && d?.grossMargin != null;
  return (
    <div class="module-card module-card--fundamentals">
      <div class="module-card-title">
        <span>📊 基本面</span>
        <CardFreshness fetchedAt={fetchedAt} />
      </div>
      {d ? (
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
      ) : (
        <div class="module-card-empty">数据不足</div>
      )}
    </div>
  );
}

export default FundamentalsCard;