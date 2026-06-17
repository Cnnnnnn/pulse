/**
 * src/renderer/metals/MetalCard.jsx
 *
 * Single-metal card: price + change + reference CNY + holding P&L.
 * Shows loading/error states when quote is missing or fetch failed.
 */

import { quoteCache, fxCache, config } from './metalStore.js';
import { calcChange, calcHoldingPnl, calcTodayPnl } from '../../metals/metal-calc.js';

function formatCurrency(value, currency) {
  if (value == null) return '—';
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatCNY(value) {
  if (value == null) return '—';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

export function MetalCard({ metal, onEdit }) {
  const quote = quoteCache.value.data[metal.id];
  const error = quoteCache.value.errors[metal.id];
  const holding = config.value.holdings[metal.id];
  const fx = fxCache.value.rate;

  // Compute reference CNY price for international metals (oz → g)
  let refCNY = null;
  if (quote && quote.currency === 'USD' && fx) {
    refCNY = (quote.price * fx) / 31.1035;
  }

  if (error) {
    return (
      <div class="metal-card metal-card-error">
        <div class="metal-card-header">
          <h3>{metal.name}</h3>
        </div>
        <div class="metal-card-error-body">⚠️ 数据获取失败</div>
        <div class="metal-card-error-meta">上次成功: {quoteCache.value.fetchedAt
          ? new Date(quoteCache.value.fetchedAt).toLocaleTimeString('zh-CN')
          : '—'}</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div class="metal-card">
        <div class="metal-card-header">
          <h3>{metal.name}</h3>
        </div>
        <div class="metal-card-loading">加载中...</div>
      </div>
    );
  }

  const { change, changePct } = calcChange(quote);
  const holdingPnl = calcHoldingPnl(holding, quote, fx);
  const todayPnl = calcTodayPnl(holding, quote, fx);
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return (
    <div class={`metal-card metal-card-${trend}`}>
      <div class="metal-card-header">
        <h3>{metal.name}</h3>
        <button class="btn-icon" onClick={() => onEdit(metal.id)}>⋯</button>
      </div>

      <div class="metal-card-price">
        <div class="price-main">
          {formatCurrency(quote.price, quote.currency)} / {quote.unit}
        </div>
        {refCNY != null && (
          <div class="price-ref">≈ {formatCNY(refCNY)} / g</div>
        )}
        <div class={`price-change ${trend}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'} {changePct.toFixed(2)}%
          <span class="change-amount">
            ({change > 0 ? '+' : ''}{formatCurrency(change, quote.currency)})
          </span>
        </div>
      </div>

      <div class="metal-card-divider" />

      <div class="metal-card-holding">
        {holding ? (
          <>
            <div class="holding-row">
              持仓 {holding.quantity} {metal.unit}
            </div>
            <div class="holding-row">
              成本 {formatCurrency(holding.costPrice, holding.costCurrency)} / {metal.unit}
            </div>
            {holdingPnl && (
              <div class={`holding-row pnl ${holdingPnl.pnlCNY > 0 ? 'gain' : holdingPnl.pnlCNY < 0 ? 'loss' : ''}`}>
                累计 {holdingPnl.pnlCNY > 0 ? '+' : ''}{formatCNY(holdingPnl.pnlCNY)} ({holdingPnl.pnlPct.toFixed(2)}%)
              </div>
            )}
            {todayPnl && (
              <div class={`holding-row pnl ${todayPnl.todayPnlCNY > 0 ? 'gain' : todayPnl.todayPnlCNY < 0 ? 'loss' : ''}`}>
                今日 {todayPnl.todayPnlCNY > 0 ? '+' : ''}{formatCNY(todayPnl.todayPnlCNY)} ({todayPnl.todayPnlPct.toFixed(2)}%)
              </div>
            )}
          </>
        ) : (
          <button class="btn btn-ghost btn-sm" onClick={() => onEdit(metal.id)}>
            + 录入持仓
          </button>
        )}
      </div>
    </div>
  );
}