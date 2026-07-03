export function FundamentalsCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--fundamentals">
      <div class="module-card-title">📊 基本面</div>
      {d ? (
        <div class="module-card-body">
          <div>ROE {d.roe ?? "—"}%</div>
          <div>毛利率 {d.grossMargin ?? "—"}%</div>
          <div>净利率 {d.netMargin ?? "—"}%</div>
        </div>
      ) : (
        <div class="module-card-empty">数据不足</div>
      )}
    </div>
  );
}

export default FundamentalsCard;
