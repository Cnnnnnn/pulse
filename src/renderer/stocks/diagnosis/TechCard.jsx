export function TechCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--tech">
      <div class="module-card-title">📈 技术面</div>
      {d ? (
        <div class="module-card-body">
          <div>MA5 {d.ma5?.toFixed(2) ?? "—"}</div>
          <div>MA20 {d.ma20?.toFixed(2) ?? "—"}</div>
          <div>MACD柱 {d.macdHist?.toFixed(3) ?? "—"}</div>
        </div>
      ) : (
        <div class="module-card-empty">数据不足</div>
      )}
    </div>
  );
}

export default TechCard;
