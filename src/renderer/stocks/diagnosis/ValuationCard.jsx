import { ModuleCard } from "./ModuleCard.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";

// ponytail: 2026-07-07 — fetcher 升级后 valuation 即使没 PE/PB 也能返 price (现价);
//          card 拿 d.price 显出来, 避免 "数据不足" 出现但用户知道当前股价.

// ponytail 2026-07-18 P0-1 T8: 透传 angle + onRefresh 给 ModuleCard.
export function ValuationCard({ data, peerCompare, angle = null, onRefresh = null }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  const pePct = peerCompare?.pePercentile;
  const pbPct = peerCompare?.pbPercentile;
  const showCompare = peerCompare && (pePct != null || pbPct != null);
  const hasAny = d && (d.pe != null || d.pb != null || d.price != null);
  return (
    <ModuleCard
      variant="valuation"
      title="💰 估值"
      angle={angle}
      onRefresh={onRefresh}
      fetchedAt={fetchedAt}
      body={hasAny ? (
        <div class="module-card-body">
          {d.price != null && <div>现价 ¥{d.price.toFixed(2)}</div>}
          <div>PE {d.pe != null ? d.pe.toFixed(2) : "—"}</div>
          <div>PB {d.pb != null ? d.pb.toFixed(2) : "—"}</div>
          {showCompare && (
            <div class="module-card-sub">
              {pePct != null && (
                <IndustryCompareBar label="PE 分位" percentile={pePct} higherIsBetter={false} />
              )}
              {pbPct != null && (
                <IndustryCompareBar label="PB 分位" percentile={pbPct} higherIsBetter={false} />
              )}
            </div>
          )}
        </div>
      ) : null}
      empty="数据不足"
    />
  );
}

export default ValuationCard;
