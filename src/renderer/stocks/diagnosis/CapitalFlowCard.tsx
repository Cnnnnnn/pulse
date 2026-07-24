import { ModuleCard } from "./ModuleCard.jsx";

// ponytail 2026-07-18 P0-1 T8: 透传 angle + onRefresh 给 ModuleCard
//   (3 个早 return 也要带, 否则 failed 时 pill 不显示).
export function CapitalFlowCard({ data, angle = null, onRefresh = null }) {
  const d = data?.status === "ok" ? data.data : null;
  if (!d) {
    return <ModuleCard variant="capital" title="🌊 资金面" angle={angle} onRefresh={onRefresh} empty="数据不足" />;
  }
  if (d.noData) {
    return <ModuleCard variant="capital" title="🌊 资金面" angle={angle} onRefresh={onRefresh} empty="暂无资金流向" />;
  }
  return (
    <ModuleCard
      variant="capital"
      title="🌊 资金面"
      angle={angle}
      onRefresh={onRefresh}
      body={
        <div class="module-card-body">
          <div>5日主力 {d.mainNetInflow5d != null ? (d.mainNetInflow5d / 1e8).toFixed(2) + "亿" : "—"}</div>
          <div>10日主力 {d.mainNetInflow10d != null ? (d.mainNetInflow10d / 1e8).toFixed(2) + "亿" : "—"}</div>
        </div>
      }
    />
  );
}

export default CapitalFlowCard;
