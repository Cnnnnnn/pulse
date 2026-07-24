import { ModuleCard } from "./ModuleCard.jsx";

// shareholders.data (见 src/stocks/detail-fetchers/shareholders.js):
//   { holderCountLatest, holderCountChangePct, reportDate,
//     institutionPctLatest, institutionChangePct, institutionReportDate }
//
// ponytail: 股东人数 环比 下降 = 筹码集中, 偏多信号; 机构持仓 上升 = 主力加仓, 偏多.
// 两项都看, 至少一项有数据就 OK.

function fmtPct(v) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ponytail 2026-07-18 P0-1 T8: 透传 angle + onRefresh 给 ModuleCard (2 个早 return 也要带).
export function ShareholdersCard({ data, angle = null, onRefresh = null }) {
  const d = data?.status === "ok" ? data.data : null;
  if (!d) {
    return <ModuleCard variant="shareholders" title="👥 股东结构" angle={angle} onRefresh={onRefresh} empty="数据不足" />;
  }
  const hasHolder = d.holderCountLatest != null;
  const hasInst = d.institutionPctLatest != null;
  if (!hasHolder && !hasInst) {
    return (
      <ModuleCard
        variant="shareholders"
        title="👥 股东结构"
        angle={angle}
        onRefresh={onRefresh}
        empty={d.noData ? "周末/非披露期暂无更新" : "暂无股东结构数据"}
      />
    );
  }
  return (
    <ModuleCard
      variant="shareholders"
      title="👥 股东结构"
      angle={angle}
      onRefresh={onRefresh}
      body={
        <div class="module-card-body">
          {hasHolder && (
            <div>
              股东人数 {(d.holderCountLatest / 10000).toFixed(2)} 万 (环比 {fmtPct(d.holderCountChangePct)})
            </div>
          )}
          {hasInst && (
            <div>
              机构持仓 {d.institutionPctLatest.toFixed(2)}% (环比 {fmtPct(d.institutionChangePct)})
            </div>
          )}
        </div>
      }
    />
  );
}

export default ShareholdersCard;
