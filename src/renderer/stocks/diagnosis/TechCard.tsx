import { ModuleCard } from "./ModuleCard.jsx";

// ponytail 2026-07-18 P0-1 T8: 透传 angle + onRefresh 给 ModuleCard.
export function TechCard({ data, angle = null, onRefresh = null }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <ModuleCard
      variant="tech"
      title="📈 技术面"
      angle={angle}
      onRefresh={onRefresh}
      body={d ? (
        <div class="module-card-body">
          <div>MA5 {d.ma5?.toFixed(2) ?? "—"}</div>
          <div>MA20 {d.ma20?.toFixed(2) ?? "—"}</div>
          <div>MACD柱 {d.macdHist?.toFixed(3) ?? "—"}</div>
        </div>
      ) : null}
      empty="数据不足"
    />
  );
}

export default TechCard;
