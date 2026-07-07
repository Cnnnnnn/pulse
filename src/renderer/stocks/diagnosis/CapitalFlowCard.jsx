export function CapitalFlowCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  if (!d) {
    return (
      <div class="module-card module-card--capital">
        <div class="module-card-title">🌊 资金面</div>
        <div class="module-card-empty">数据不足</div>
      </div>
    );
  }
  if (d.noData) {
    return (
      <div class="module-card module-card--capital">
        <div class="module-card-title">🌊 资金面</div>
        <div class="module-card-empty">暂无资金流向</div>
      </div>
    );
  }
  return (
    <div class="module-card module-card--capital">
      <div class="module-card-title">🌊 资金面</div>
      <div class="module-card-body">
        <div>5日主力 {d.mainNetInflow5d != null ? (d.mainNetInflow5d / 1e8).toFixed(2) + "亿" : "—"}</div>
        <div>10日主力 {d.mainNetInflow10d != null ? (d.mainNetInflow10d / 1e8).toFixed(2) + "亿" : "—"}</div>
      </div>
    </div>
  );
}

export default CapitalFlowCard;
