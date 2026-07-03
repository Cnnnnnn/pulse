import { results } from "../stockStore.js";
import { openDiagnosis } from "../diagnosisStore.js";

export function StockMiniList({ currentCode }) {
  const rows = results.value;
  return (
    <aside class="stock-mini-list" data-testid="stock-mini-list">
      <div class="stock-mini-list-head">筛选结果 {rows.length}</div>
      <div class="stock-mini-list-body">
        {rows.map((r) => (
          <button
            type="button"
            key={r.code}
            class={`stock-mini-item${r.code === currentCode ? " active" : ""}`}
            onClick={() => openDiagnosis(r.code)}
          >
            <span class="stock-mini-name">{r.name || r.code}</span>
            <span class={`stock-mini-price ${r.changePct >= 0 ? "up" : "down"}`}>
              {r.price} {r.changePct >= 0 ? "+" : ""}{r.changePct}%
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export default StockMiniList;
