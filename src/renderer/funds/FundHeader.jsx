/**
 * src/renderer/funds/FundHeader.jsx
 *
 * 总览卡片 + 工具栏:
 *   4 个数字卡片: 今日预估 / 总市值 / 总盈亏 / 收益率
 *   工具栏: 品牌 + [+ 添加持仓] [🔄 刷新] [最后更新] + 搜索框
 */

import {
  totalMetrics,
  schedulerState,
  openAddModal,
  searchQuery,
  setSearchQuery,
  pnlRollups,
  navSource,
  NAV_SOURCE_LABELS,
  setNavSource,
} from './fundStore.js';
import { api } from '../api.js';

function fmtCurrency(n) {
  if (!Number.isFinite(n)) return '¥0.00';
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(p) {
  if (!Number.isFinite(p)) return '0.00%';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function fmtTime(ms) {
  if (!ms) return '--:--';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function FundHeader({ onRefresh }) {
  const m = totalMetrics.value;
  const s = schedulerState.value;
  const rollups = pnlRollups.value;
  const isRunning = s.status === 'running';
  const isClosed = s.status === 'closed';
  const source = navSource.value;
  const sourceLabel = NAV_SOURCE_LABELS[source] || NAV_SOURCE_LABELS.tiantian;

  const statusText = isClosed
    ? `非交易时段 · ${sourceLabel}`
    : isRunning
      ? `估值中 · ${sourceLabel}`
      : s.lastFetch
        ? `更新于 ${fmtTime(s.lastFetch)} · ${sourceLabel}`
        : '等待首次拉取净值';

  return (
    <div class="fund-header">
      <div class="fund-header-toolbar">
        <div class="fund-header-brand">
          <span class="fund-header-icon">💰</span>
          <div class="fund-header-brand-text">
            <h2 class="fund-header-title">基金管理</h2>
            <span class="fund-header-sub">
              {statusText}
              {isRunning && <span class="fund-spinner" aria-hidden="true"> ⏳</span>}
            </span>
          </div>
        </div>
        <div class="fund-header-actions">
          <div class="fund-source-toggle" role="radiogroup" aria-label="净值数据源">
            {Object.entries(NAV_SOURCE_LABELS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={source === id}
                class={`fund-source-btn${source === id ? ' active' : ''}`}
                onClick={() => setNavSource(api, id)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            id="fund-search-input"
            type="text"
            class="fund-search-input"
            placeholder="搜索代码 / 名称"
            value={searchQuery.value}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
          <button
            type="button"
            class="fund-btn fund-btn-primary"
            onClick={() => openAddModal()}
          >
            + 添加持仓
          </button>
          <button
            type="button"
            class={`fund-btn fund-btn-ghost${isRunning ? ' fund-btn-loading' : ''}`}
            onClick={() => onRefresh && onRefresh()}
            disabled={isRunning}
            title="立即刷新净值"
            aria-label="立即刷新净值"
          >
            🔄
          </button>
        </div>
      </div>
      <div class="fund-summary-cards">
        <div class="fund-summary-card fund-summary-card--hero">
          <div class="fund-summary-label">总市值</div>
          <div class="fund-summary-value">{fmtCurrency(m.totalMarketValue)}</div>
          <div class="fund-summary-sub">{m.count} 只 · {m.countWithNav} 只有净值</div>
        </div>
        <div class="fund-summary-card">
          <div class="fund-summary-label">总盈亏</div>
          <div class={`fund-summary-value ${m.totalProfit >= 0 ? 'positive' : 'negative'}`}>
            {fmtCurrency(m.totalProfit)}
          </div>
          <div class={`fund-summary-sub ${m.totalProfit >= 0 ? 'positive' : 'negative'}`}>
            {fmtPct(m.totalProfitPct)}
          </div>
        </div>
        <div class="fund-summary-card">
          <div class="fund-summary-label">今日预估</div>
          <div class={`fund-summary-value ${m.todayProfit >= 0 ? 'positive' : 'negative'}`}>
            {fmtCurrency(m.todayProfit)}
          </div>
          <div class={`fund-summary-sub ${m.todayProfit >= 0 ? 'positive' : 'negative'}`}>
            {fmtPct(m.countWithNav > 0 ? (m.todayProfit / Math.max(m.totalMarketValue, 1)) * 100 : 0)}
          </div>
        </div>
        <div class="fund-summary-card">
          <div class="fund-summary-label">总成本</div>
          <div class="fund-summary-value">{fmtCurrency(m.totalCost)}</div>
        </div>
        <div class="fund-summary-card">
          <div class="fund-summary-label">本月累计</div>
          <div class={`fund-summary-value ${rollups.currentMonth.profit >= 0 ? 'positive' : 'negative'}`}>
            {fmtCurrency(rollups.currentMonth.profit)}
          </div>
          <div class={`fund-summary-sub ${rollups.previousMonth.profit >= 0 ? 'positive' : 'negative'}`}>
            上月 {fmtCurrency(rollups.previousMonth.profit)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FundHeader;