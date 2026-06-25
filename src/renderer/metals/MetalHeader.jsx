/**
 * src/renderer/metals/MetalHeader.jsx
 *
 * CNY portfolio overview cards + refresh button + last-update timestamp.
 */

import { overview, schedulerState, fxCache, refreshNow } from './metalStore.js';
import { IconMedal, IconRefresh } from '../components/icons.jsx';

function formatCNY(value) {
  if (value == null) return '—';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function MetalHeader() {
  const ov = overview.value;
  const state = schedulerState.value;
  const fx = fxCache.value.rate;

  return (
    <div class="metals-header">
      <div class="metals-header-row">
        <h2 class="metals-header-title">
          <IconMedal size={20} />
          贵金属
        </h2>
        <div class="metals-header-status">
          最后更新: {formatTime(state.lastFetch)}
          {state.status === 'running' && <span class="spinner"> ⟳</span>}
          <button class="btn btn-ghost btn-sm metals-refresh-btn" onClick={refreshNow}>
            <IconRefresh size={14} /> 刷新
          </button>
        </div>
      </div>

      <div class="metals-overview-cards">
        <div class="overview-card">
          <div class="overview-label">总市值 (CNY)</div>
          <div class="overview-value">{formatCNY(ov.totalMarketValueCNY)}</div>
          <div class="overview-meta">
            {ov.totalMarketValueCNY != null && fx != null
              ? `汇率 ${fx.toFixed(4)}`
              : '汇率待刷新'}
          </div>
        </div>

        <div class="overview-card">
          <div class="overview-label">总盈亏 (CNY)</div>
          <div class={`overview-value ${ov.totalPnlCNY > 0 ? 'positive' : ov.totalPnlCNY < 0 ? 'negative' : ''}`}>
            {formatCNY(ov.totalPnlCNY)}
          </div>
          <div class="overview-meta">
            {ov.totalPnlCNY != null && (ov.totalMarketValueCNY - ov.totalPnlCNY) > 0
              ? `${((ov.totalPnlCNY / (ov.totalMarketValueCNY - ov.totalPnlCNY)) * 100).toFixed(2)}%`
              : ''}
          </div>
        </div>

        <div class="overview-card">
          <div class="overview-label">今日预估 (CNY)</div>
          <div class={`overview-value ${ov.todayEstimatedCNY > 0 ? 'positive' : ov.todayEstimatedCNY < 0 ? 'negative' : ''}`}>
            {formatCNY(ov.todayEstimatedCNY)}
          </div>
          <div class="overview-meta">↑ 较昨收</div>
        </div>
      </div>
    </div>
  );
}