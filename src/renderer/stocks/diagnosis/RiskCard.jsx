export function RiskCard({ risks }) {
  const list = Array.isArray(risks) ? risks : [];
  return (
    <div class="module-card module-card--risk">
      <div class="module-card-title">⚠️ 风险提示</div>
      {list.length > 0 ? (
        <ul class="module-card-body module-card-risk-list">
          {list.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : (
        <div class="module-card-empty">暂无明显风险信号</div>
      )}
    </div>
  );
}

export default RiskCard;
