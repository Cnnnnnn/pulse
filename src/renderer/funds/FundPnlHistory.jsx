/**
 * src/renderer/funds/FundPnlHistory.jsx
 *
 * 每日 / 月度盈亏记录面板.
 */

import { useState } from 'preact/hooks';
import {
  dailySnapshots,
  selectedHistoryMonth,
  pnlRollups,
  selectedMonthProfit,
  setSelectedHistoryMonth,
} from './fundStore.js';
import {
  listDaysForMonth,
  shiftMonth,
  formatMonthLabel,
  ymShanghai,
} from '../../funds/fund-history.js';

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

function fmtDateLabel(ymd) {
  if (!ymd) return '--';
  const parts = ymd.split('-');
  if (parts.length < 3) return ymd;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
}

export function FundPnlHistory({ layout = 'sidebar' }) {
  const isPage = layout === 'page';
  const [collapsed, setCollapsed] = useState(false);
  const ym = selectedHistoryMonth.value;
  const rollups = pnlRollups.value;
  const monthProfitVal = selectedMonthProfit.value;
  const isCurrentMonth = ym === ymShanghai(new Date());

  const days = listDaysForMonth(dailySnapshots.value || [], ym);

  function goPrevMonth() {
    setSelectedHistoryMonth(shiftMonth(ym, -1));
  }

  function goNextMonth() {
    if (isCurrentMonth) return;
    setSelectedHistoryMonth(shiftMonth(ym, 1));
  }

  return (
    <section
      class={`fund-pnl-history${isPage ? ' fund-pnl-history--page' : ''}`}
      aria-label="盈亏记录"
    >
      <div class="fund-pnl-history-header">
        <h3 class="fund-pnl-history-title">盈亏记录</h3>
        <div class="fund-pnl-month-nav">
          <button
            type="button"
            class="fund-pnl-month-btn"
            onClick={goPrevMonth}
            aria-label="上个月"
          >
            ‹
          </button>
          <span class="fund-pnl-month-label">{formatMonthLabel(ym)}</span>
          <button
            type="button"
            class="fund-pnl-month-btn"
            onClick={goNextMonth}
            disabled={isCurrentMonth}
            aria-label="下个月"
          >
            ›
          </button>
          <button
            type="button"
            class="fund-pnl-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展开盈亏记录' : '收起盈亏记录'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div class={`fund-pnl-summary${isPage ? ' fund-pnl-summary--page' : ''}`}>
        <div class="fund-pnl-summary-item fund-pnl-summary-item-primary">
          <span class="fund-pnl-summary-label">
            {isCurrentMonth ? '本月累计盈亏' : `${formatMonthLabel(ym)} 盈亏`}
          </span>
          <span class={`fund-pnl-summary-value ${monthProfitVal >= 0 ? 'positive' : 'negative'}`}>
            {fmtCurrency(monthProfitVal)}
          </span>
        </div>
        <div class="fund-pnl-summary-item">
          <span class="fund-pnl-summary-label">上月盈亏</span>
          <span class={`fund-pnl-summary-value ${rollups.previousMonth.profit >= 0 ? 'positive' : 'negative'}`}>
            {fmtCurrency(rollups.previousMonth.profit)}
          </span>
        </div>
        {isPage && days.length > 0 && (
          <div class="fund-pnl-summary-item">
            <span class="fund-pnl-summary-label">本月交易日</span>
            <span class="fund-pnl-summary-value fund-pnl-summary-value-muted">
              {days.length} 天
            </span>
          </div>
        )}
      </div>

      {days.length === 0 ? (
        <div class="fund-pnl-empty">
          {isCurrentMonth
            ? '还没有记录，净值刷新后会自动记下每日盈亏'
            : '这个月还没有盈亏记录'}
        </div>
      ) : (
        <div class="fund-pnl-table-wrap">
          <table class="fund-pnl-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>当日盈亏</th>
                <th>收益率</th>
                <th>市值</th>
              </tr>
            </thead>
            <tbody>
              {days.map((row) => (
                <tr key={row.date}>
                  <td>{fmtDateLabel(row.date)}</td>
                  <td class={row.todayProfit >= 0 ? 'positive' : 'negative'}>
                    {fmtCurrency(row.todayProfit)}
                  </td>
                  <td class={row.dayReturnPct >= 0 ? 'positive' : 'negative'}>
                    {fmtPct(row.dayReturnPct)}
                  </td>
                  <td>{fmtCurrency(row.totalMarketValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </section>
  );
}

export default FundPnlHistory;
