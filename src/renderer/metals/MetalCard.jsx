/**
 * src/renderer/metals/MetalCard.jsx
 *
 * Single-metal card. v2.21 重做: 人民币每克为主显示.
 *
 * 信息层级 (中国投资者视角):
 *   主:   ¥XXX.XX /克  (28px/700)   ← 所有品种统一口径
 *   副:   ↑/↓ X.XX% (+/−¥X.XX/克)    ← 涨跌换算到 ¥/g, 红涨绿跌
 *   参考: 现货 $XXXX/oz · 16:52       ← 国际品种的原始报价
 *         上海黄金交易所 · 16:52       ← 国内品种的来源
 *
 * 换算:
 *   国际 (USD/oz): refCNY = price × fx ÷ 31.1035 (金衡盎司→克)
 *   国内 (CNY/g):  refCNY = price (本身即是)
 *   change 同理换算到 ¥/g; changePct 币种无关.
 */

import { quoteCache, fxCache, config } from './metalStore.js';
import { calcChange, calcHoldingPnl, calcTodayPnl } from '../../metals/metal-calc.js';
import {
  isMetalPinned,
  addWatchlistItem,
  removeWatchlistItem,
} from '../watchlist/watchlist-store.js';
import { PinIcon, IconMoreHorizontal, IconAlert } from '../components/icons.jsx';

const GRAM_PER_OZ = 31.1035;

function formatCNY(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatUSD(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function MetalCard({ metal, onEdit }) {
  const quote = quoteCache.value.data[metal.id];
  const error = quoteCache.value.errors[metal.id];
  const holding = config.value.holdings[metal.id];
  const fx = fxCache.value.rate;
  const pinned = isMetalPinned(metal.id);
  const togglePin = (e) => {
    e.stopPropagation();
    if (pinned) removeWatchlistItem({ type: 'metal', ref: metal.id });
    else addWatchlistItem({ type: 'metal', ref: metal.id });
  };

  // 每克人民币价格 (主显示)
  const isCNY = quote && quote.currency === 'CNY';
  const refCNY = !quote ? null
    : isCNY ? quote.price
    : (fx != null ? (quote.price * fx) / GRAM_PER_OZ : null);

  // 涨跌换算到 ¥/g
  let changePerGramCNY = null;
  let changePct = 0;
  let trend = 'flat';
  if (quote) {
    const c = calcChange(quote);
    changePct = c.changePct;
    trend = c.change > 0 ? 'up' : c.change < 0 ? 'down' : 'flat';
    if (isCNY) {
      changePerGramCNY = c.change;
    } else if (fx != null) {
      changePerGramCNY = (c.change * fx) / GRAM_PER_OZ;
    }
  }

  if (error) {
    return (
      <div class="metal-card metal-card-error">
        <div class="metal-card-header">
          <h3>{metal.name}</h3>
          <div class="metal-card-actions">
            <button
              type="button"
              class={`fund-row-action-btn${pinned ? ' fund-row-action-btn--active' : ''}`}
              onClick={togglePin}
              title={pinned ? '取消关注' : '价格异动提醒'}
            >
              <PinIcon filled={pinned} size={14} />
            </button>
            <button class="btn-icon" onClick={() => onEdit(metal.id)} aria-label="编辑"><IconMoreHorizontal size={14} /></button>
          </div>
        </div>
        <div class="metal-card-error-body"><IconAlert size={14} /> 数据获取失败</div>
        <div class="metal-card-error-meta">
          上次成功: {quoteCache.value.fetchedAt
            ? formatTime(quoteCache.value.fetchedAt)
            : '—'}
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div class="metal-card">
        <div class="metal-card-header">
          <h3>{metal.name}</h3>
          <div class="metal-card-actions">
            <button
              type="button"
              class={`fund-row-action-btn${pinned ? ' fund-row-action-btn--active' : ''}`}
              onClick={togglePin}
              title={pinned ? '取消关注' : '价格异动提醒'}
            >
              <PinIcon filled={pinned} size={14} />
            </button>
            <button class="btn-icon" onClick={() => onEdit(metal.id)} aria-label="编辑"><IconMoreHorizontal size={14} /></button>
          </div>
        </div>
        <div class="metal-card-loading">加载中...</div>
      </div>
    );
  }

  // 国际品种无法换算 (汇率缺失) 的降级态
  const fxMissing = refCNY == null;

  const holdingPnl = holding ? calcHoldingPnl(holding, quote, fx) : null;
  const todayPnl = holding ? calcTodayPnl(holding, quote, fx) : null;

  return (
    <div class={`metal-card metal-card-${trend}`}>
      <div class="metal-card-header">
        <h3>{metal.name}</h3>
        <div class="metal-card-actions">
          <button
            type="button"
            class={`fund-row-action-btn${pinned ? ' fund-row-action-btn--active' : ''}`}
            onClick={togglePin}
            title={pinned ? '取消关注' : '价格异动提醒'}
            aria-label={pinned ? '取消关注' : '加入关注列表'}
          >
            <PinIcon filled={pinned} size={14} />
          </button>
          <button class="btn-icon" onClick={() => onEdit(metal.id)} title="编辑持仓" aria-label="编辑持仓"><IconMoreHorizontal size={14} /></button>
        </div>
      </div>

      <div class="metal-card-price-main">
        {fxMissing ? (
          <div class="price-cny price-cny-pending">汇率待刷新</div>
        ) : (
          <div class="price-cny">
            {formatCNY(refCNY)}
            <span class="price-unit">/克</span>
          </div>
        )}
        <div class={`price-change-cny price-change-cny-${trend}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'} {Math.abs(changePct).toFixed(2)}%
          {changePerGramCNY != null && (
            <span class="change-amount-cny">
              ({changePerGramCNY >= 0 ? '+' : ''}{formatCNY(changePerGramCNY)}/克)
            </span>
          )}
        </div>
      </div>

      <div class="metal-card-ref-row">
        {isCNY ? (
          <span>上海黄金交易所</span>
        ) : (
          <span>现货 {formatUSD(quote.price)}/oz</span>
        )}
        <span class="ref-time">{formatTime(quote.quoteTime)}</span>
      </div>

      <div class="metal-card-divider" />

      <div class="metal-card-holding">
        {holding ? (
          <>
            <div class="holding-row">
              <span class="holding-label">持仓</span>
              <span class="holding-value">{holding.quantity.toLocaleString('zh-CN')} {metal.unit}</span>
            </div>
            <div class="holding-row">
              <span class="holding-label">成本</span>
              <span class="holding-value">
                {holding.costCurrency === 'CNY'
                  ? formatCNY(holding.costPrice)
                  : formatUSD(holding.costPrice)}
                /{metal.unit}
              </span>
            </div>
            {holdingPnl && (
              <div class={`holding-row pnl ${holdingPnl.pnlCNY > 0 ? 'positive' : holdingPnl.pnlCNY < 0 ? 'negative' : ''}`}>
                <span class="holding-label">累计盈亏</span>
                <span class="holding-value">
                  {holdingPnl.pnlCNY >= 0 ? '+' : ''}{formatCNY(holdingPnl.pnlCNY)}
                  <span class="pnl-pct">({holdingPnl.pnlPct >= 0 ? '+' : ''}{holdingPnl.pnlPct.toFixed(2)}%)</span>
                </span>
              </div>
            )}
            {todayPnl && (
              <div class={`holding-row pnl ${todayPnl.todayPnlCNY > 0 ? 'positive' : todayPnl.todayPnlCNY < 0 ? 'negative' : ''}`}>
                <span class="holding-label">今日</span>
                <span class="holding-value">
                  {todayPnl.todayPnlCNY >= 0 ? '+' : ''}{formatCNY(todayPnl.todayPnlCNY)}
                </span>
              </div>
            )}
          </>
        ) : (
          <button class="metal-add-holding-btn" onClick={() => onEdit(metal.id)}>
            + 录入持仓
          </button>
        )}
      </div>
    </div>
  );
}
