/**
 * src/renderer/metals/MetalHeader.jsx
 *
 * Phase 3 fusion: 3 总览卡 + 4 品种 tab (内联 sparkline + change%)
 * + 单品种 DetailTrend. selectedMetalId 驱动 tab 高亮 + Detail 内容.
 * 一个 tab 卡片同时承担 "切换" + "mini 趋势对比" 两职.
 */
import {
  overview, schedulerState, fxCache, refreshNow, selectedMetalId, historyMap,
} from './metalStore.js';
import { METALS } from '../../metals/metal-config.js';
import { IconMedal, IconRefresh } from '../components/icons.jsx';
import { MetalDetailTrend } from './MetalDetailTrend.jsx';
import { Sparkline } from '../components/Sparkline.jsx';

function formatCNY(value) {
  if (value == null) return '—';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function tabChangeFor(metalId) {
  const arr = historyMap.value[metalId] || [];
  if (arr.length < 2) return null;
  const metal = METALS.find((m) => m.id === metalId);
  const divisor = metal && metal.unitDivisor ? metal.unitDivisor : 1;
  const closes = arr.map((p) => p.close / divisor);
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / first) * 100;
}

export function MetalHeader() {
  const ov = overview.value;
  const state = schedulerState.value;
  const fx = fxCache.value.rate;
  const selId = selectedMetalId.value;

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

      <div class="metals-metal-tabs" role="tablist" aria-label="切换品种趋势图">
        {METALS.map((m) => {
          const arr = historyMap.value[m.id] || [];
          const closes = arr.map((p) => p.close / (m.unitDivisor || 1));
          const hasData = closes.length >= 2;
          const change = hasData ? tabChangeFor(m.id) : null;
          const isSelected = m.id === selId;
          const changeClass = change == null
            ? ''
            : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              class={`metals-metal-tab${isSelected ? ' is-selected' : ''}`}
              onClick={() => { selectedMetalId.value = m.id; }}
            >
              <div class="metals-metal-tab-row">
                <span class="metals-metal-tab-name">{m.shortName}</span>
                {m.proxyLabel && (
                  <span class="metals-metal-tab-proxy">{m.proxyLabel}</span>
                )}
              </div>
              <div class="metals-metal-tab-chart">
                {hasData ? (
                  <Sparkline closes={closes} width={64} height={24} />
                ) : (
                  <div class="metals-metal-tab-loading">30 天加载中</div>
                )}
              </div>
              <div class={`metals-metal-tab-change ${changeClass}`}>
                {change != null
                  ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
                  : '—'}
              </div>
            </button>
          );
        })}
      </div>

      {selId && <MetalDetailTrend />}
    </div>
  );
}
