import { closeDiagnosis } from "../diagnosisStore.js";

export function StockDiagnosisHeader({ stock, scores }) {
  return (
    <header class="diagnosis-header">
      <button type="button" class="diagnosis-back" data-testid="diagnosis-back" onClick={closeDiagnosis}>
        ← 返回选股
      </button>
      <div class="diagnosis-hero">
        <span class="diagnosis-hero-name">{stock?.name || stock?.code}</span>
        <span class="diagnosis-hero-code">{stock?.code}</span>
        {stock?.price != null && (
          <span class={`diagnosis-hero-price ${stock.changePct >= 0 ? "up" : "down"}`}>
            ¥{stock.price} {stock.changePct >= 0 ? "+" : ""}{stock.changePct}%
          </span>
        )}
      </div>
      {scores?.overall != null && (
        <span class="diagnosis-rating-badge">{scores.overall}/10</span>
      )}
    </header>
  );
}

export default StockDiagnosisHeader;
