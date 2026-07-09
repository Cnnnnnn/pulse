/**
 * src/renderer/metals/MetalHeader.jsx
 *
 * 单行 status bar: 标题 + 总览数字 (总市值/总盈亏/今日预估) + 刷新按钮.
 * Phase 4 移除 3 总览卡 grid + sparkline tab bar (改由 MetalTable 行内嵌 sparkline).
 */
import {
  overview, schedulerState, refreshNow,
} from "./metalStore.js";
import { IconMedal, IconRefresh } from "../components/icons.jsx";

function formatCNY(value) {
  if (value == null) return "—";
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit", minute: "2-digit",
  });
}

function pnlClass(value) {
  if (value == null) return "";
  if (value > 0) return "metals-pos";
  if (value < 0) return "metals-neg";
  return "";
}

export function MetalHeader() {
  const ov = overview.value;
  const state = schedulerState.value;

  return (
    <header class="metals-header feature-header">
      <div class="metals-header-title">
        <IconMedal size={18} />
        <span>贵金属</span>
      </div>

      <div class="metals-header-summary">
        <div class="metals-header-summary-item">
          <span class="metals-header-summary-label">总市值</span>
          <span class="metals-header-summary-value">
            {formatCNY(ov.totalMarketValueCNY)}
          </span>
        </div>
        <div class="metals-header-summary-item">
          <span class="metals-header-summary-label">总盈亏</span>
          <span class={`metals-header-summary-value ${pnlClass(ov.totalPnlCNY)}`}>
            {formatCNY(ov.totalPnlCNY)}
          </span>
        </div>
        <div class="metals-header-summary-item">
          <span class="metals-header-summary-label">今日预估</span>
          <span class={`metals-header-summary-value ${pnlClass(ov.todayEstimatedCNY)}`}>
            {formatCNY(ov.todayEstimatedCNY)}
          </span>
        </div>
      </div>

      <div class="metals-header-status">
        {state.lastFetch && <span>更新 {formatTime(state.lastFetch)}</span>}
        {state.status === "running" && <span class="spinner">⟳</span>}
        <button
          class="btn btn-ghost btn-sm metals-refresh-btn"
          onClick={refreshNow}
        >
          <IconRefresh size={14} /> 刷新
        </button>
      </div>
    </header>
  );
}
