import { ModuleCard } from "./ModuleCard.jsx";

// corporate_events.data (见 src/stocks/detail-fetchers/corporate-events.js):
//   { dividends, unlocks, offerings, nearestUnlockDays, latestCashBonusPer10 }
//
// ponytail: 优先显示 2 个高价值信号: 分红预案 + 距解禁天数. 配股/增发次要, 空间不够折叠.

function fmtDays(days) {
  if (days == null) return "—";
  if (days >= 0) return `距今 ${days} 天`;
  return `${Math.abs(days)} 天前已解禁`;
}

export function CorporateEventsCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  if (!d) {
    return <ModuleCard variant="events" title="📅 股本事件" empty="数据不足" />;
  }
  const hasDiv = d.dividends && d.dividends.length > 0;
  const hasUnlock = d.nearestUnlockDays != null;
  const hasOffer = d.offerings && d.offerings.length > 0;
  if (!hasDiv && !hasUnlock && !hasOffer) {
    return <ModuleCard variant="events" title="📅 股本事件" empty="近期无股本事件" />;
  }
  return (
    <ModuleCard
      variant="events"
      title="📅 股本事件"
      body={
        <div class="module-card-body">
          {hasDiv && d.dividends[0].cashBonus != null && (
            <div>派现 {d.dividends[0].cashBonus.toFixed(2)}/10 股</div>
          )}
          {hasUnlock && (
            <div>下次解禁 {fmtDays(d.nearestUnlockDays)}</div>
          )}
          {hasOffer && (
            <div class="module-card-meta">最近有增发/配股</div>
          )}
        </div>
      }
    />
  );
}

export default CorporateEventsCard;
