import { ModuleCard } from "./ModuleCard.jsx";

export function CapitalFlowCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  if (!d) {
    return <ModuleCard variant="capital" title="🌊 资金面" empty="数据不足" />;
  }
  if (d.noData) {
    return <ModuleCard variant="capital" title="🌊 资金面" empty="暂无资金流向" />;
  }
  return (
    <ModuleCard
      variant="capital"
      title="🌊 资金面"
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
