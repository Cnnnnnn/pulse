// earnings_forecast.data (见 src/stocks/detail-fetchers/earnings-forecast.js):
//   { items: [{ reportDate, type, changeMin, changeMax, reason }], latest }
// type 字段中文: 预增/预减/扭亏/续亏/略增/略减/首亏/不确定.
const TYPE_TONE = {
  预增: "positive",
  略增: "positive",
  扭亏: "positive",
  预减: "cautious",
  略减: "cautious",
  首亏: "cautious",
  续亏: "cautious",
  不确定: "neutral",
};

function formatChange(min, max) {
  if (min == null && max == null) return "";
  if (min != null && max != null && min !== max) {
    return `${min > 0 ? "+" : ""}${min}% ~ ${max > 0 ? "+" : ""}${max}%`;
  }
  const v = min != null ? min : max;
  return `${v > 0 ? "+" : ""}${v}%`;
}

export function EarningsForecastCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  const items = Array.isArray(d?.items) ? d.items : null;
  if (items && items.length === 0) {
    return (
      <div class="module-card module-card--earnings">
        <div class="module-card-title">📈 业绩预期</div>
        <div class="module-card-empty">近期无业绩预告</div>
      </div>
    );
  }
  const latest = d && d.latest;
  if (!latest) {
    return (
      <div class="module-card module-card--earnings">
        <div class="module-card-title">📈 业绩预期</div>
        <div class="module-card-empty">数据不足</div>
      </div>
    );
  }
  const tone = TYPE_TONE[latest.type] || "neutral";
  return (
    <div class="module-card module-card--earnings">
      <div class="module-card-title">📈 业绩预期</div>
      <div class="module-card-body">
        <div>最新 ({(latest.reportDate || "?").slice(0, 7)})</div>
        <div class={`module-card-tone-${tone}`}>
          {latest.type || "披露"} {formatChange(latest.changeMin, latest.changeMax)}
        </div>
        {items.length > 1 && (
          <div class="module-card-meta">近 {items.length} 期有披露</div>
        )}
      </div>
    </div>
  );
}

export default EarningsForecastCard;
