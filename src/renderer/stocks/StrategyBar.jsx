/**
 * src/renderer/stocks/StrategyBar.jsx
 *
 * 策略 chip 横条 — 4 个预设策略平铺, 一键切换.
 * 对照 spec §6.4 方案 A. 点 chip → applyStrategy(id) 自动填条件.
 */
import { STRATEGIES, activeStrategy, applyStrategy } from "./stockStore.js";

export function StrategyBar() {
  const cur = activeStrategy.value;
  return (
    <div class="stock-strategy-bar">
      <span class="stock-strategy-label">策略</span>
      {STRATEGIES.map((s) => (
        <button
          key={s.id}
          type="button"
          class={`stock-strategy-chip${cur === s.id ? " active" : ""}`}
          onClick={() => applyStrategy(s.id)}
        >
          {s.label}
        </button>
      ))}
      <span
        class={`stock-strategy-chip stock-strategy-custom${
          cur === "custom" ? " active" : ""
        }`}
      >
        自定义
      </span>
    </div>
  );
}

export default StrategyBar;
