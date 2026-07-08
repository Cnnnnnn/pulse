// ponytail: 2026-07-07 — 标题区右侧加 CardFreshness 角标 (数据时间戳).
//          主体加 IndustryCompareBar: PE/PB 历史分位 (peer_compare 提供).
//          peerCompare 缺数据时 (行业未知 / 接口失败) 整段隐藏, 不渲染空骨架.
// ponytail: 2026-07-07 — fetcher 升级后 valuation 即使没 PE/PB 也能返 price (现价);
//          card 拿 d.price 显出来, 避免 "数据不足" 出现但用户知道当前股价.
import { CardFreshness } from "./CardFreshness.jsx";
import { IndustryCompareBar } from "./IndustryCompareBar.jsx";

export function ValuationCard({ data, peerCompare }) {
  const d = data?.status === "ok" ? data.data : null;
  const fetchedAt = data?.status === "ok" ? data.fetchedAt : null;
  const pePct = peerCompare?.pePercentile;
  const pbPct = peerCompare?.pbPercentile;
  const showCompare = peerCompare && (pePct != null || pbPct != null);
  // 至少 PE/PB/Price 任一不为 null 才显示 card, 全空 → 数据不足
  const hasAny = d && (d.pe != null || d.pb != null || d.price != null);
  return (
    <div class="module-card module-card--valuation">
      <div class="module-card-title">
        <span>💰 估值</span>
        <CardFreshness fetchedAt={fetchedAt} />
      </div>
      {hasAny ? (
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
      ) : (
        <div class="module-card-empty">数据不足</div>
      )}
    </div>
  );
}

export default ValuationCard;