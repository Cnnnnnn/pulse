/**
 * src/renderer/metals/MetalTrendStrip.jsx
 *
 * Header 4 列里的"30 天走势"列: 4 个 mini sparkline 横排,
 * 点击切换 selectedMetalId.
 */
import { historyMap, selectedMetalId } from "./metalStore.js";
import { METALS } from "../../metals/metal-config.js";
import { Sparkline } from "../components/Sparkline.jsx";

export function MetalTrendStrip() {
  const sel = selectedMetalId.value;
  return (
    <div class="metals-trend-strip">
      {METALS.map((m) => {
        const arr = historyMap.value[m.id] || [];
        const closes = arr.map((p) => p.close / (m.unitDivisor || 1));
        const isSelected = m.id === sel;
        return (
          <button
            type="button"
            class={`metals-trend-cell${isSelected ? " is-selected" : ""}`}
            onClick={() => { selectedMetalId.value = m.id; }}
            key={m.id}
            aria-pressed={isSelected}
            aria-label={`查看 ${m.name} 近 30 天走势`}
          >
            <div class="metals-trend-cell-head">
              <span class="metals-trend-cell-name">{m.shortName}</span>
              {m.proxyLabel && (
                <span class="metals-trend-cell-proxy">{m.proxyLabel}</span>
              )}
            </div>
            <div class="metals-trend-cell-chart">
              {closes.length >= 2 ? (
                <Sparkline closes={closes} width={120} height={36} />
              ) : (
                <div class="metals-trend-cell-skeleton">30 天加载中</div>
              )}
            </div>
            <div class="metals-trend-cell-stats">
              {closes.length >= 1 ? (
                <>
                  <span>{closes.length} 天</span>
                  <span>起 ¥{closes[0].toFixed(2)}</span>
                  <span>终 ¥{closes[closes.length - 1].toFixed(2)}</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
