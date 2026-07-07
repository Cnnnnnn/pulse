export function ValuationCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--valuation">
      <div class="module-card-title">💰 估值</div>
      {d ? (
        <div class="module-card-body">
          <div>PE {d.pe ?? "—"}</div>
          <div>PB {d.pb ?? "—"}</div>
        </div>
      ) : (
        <div class="module-card-empty">数据不足</div>
      )}
    </div>
  );
}

export default ValuationCard;
