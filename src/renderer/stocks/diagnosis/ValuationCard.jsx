// ponytail: 2026-07-07 — 标题区右侧加 CardFreshness 角标 (数据时间戳).
//          主体加 IndustryCompareBar: PE/PB 历史分位 (peer_compare 提供).
//          peerCompare 缺数据时 (行业未知 / 接口失败) 整段隐藏, 不渲染空骨架.
import { CardFreshness } from "./CardFreshness.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";

export function ValuationCard({ data, peerCompare }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  const pePct = peerCompare?.pePercentile;
  const pbPct = peerCompare?.pbPercentile;
  const showCompare = peerCompare && (pePct != null || pbPct != null);
  return (
    <div class="module-card module-card--valuation">
      <div class="module-card-title">
        <span>💰 估值</span>
        <CardFreshness fetchedAt={fetchedAt} />
      </div>
      {d ? (
        <div class="module-card-body">
          <div>PE {d.pe ?? "—"}</div>
          <div>PB {d.pb ?? "—"}</div>
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
      ) : (
        <div class="module-card-empty">数据不足</div>
      )}
    </div>
  );
}

export default ValuationCard;