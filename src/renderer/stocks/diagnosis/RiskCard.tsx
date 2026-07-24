import { ModuleCard } from "./ModuleCard.jsx";

export function RiskCard({ risks }) {
  const list = Array.isArray(risks) ? risks : [];
  return (
    <ModuleCard
      variant="risk"
      title="⚠️ 风险提示"
      body={list.length > 0 ? (
        <ul class="module-card-body module-card-risk-list">
          {list.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}
      empty="暂无明显风险信号"
    />
  );
}

export default RiskCard;
