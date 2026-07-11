/**
 * src/renderer/funds/FundCard.jsx
 *
 * 单只基金卡片 — 替换 FundRow. 保持 FundRow 的数据字段 / 格式化 / 状态机,
 * 卡片化布局 + 底部 NAV sparkline.
 *
 * 错误态 (单只拉取失败): 显示错误信息.
 */

import { useState } from 'preact/hooks';
import { navCache, navSource, NAV_SOURCE_LABELS, openEditModal, removeFund, backfillFund } from './fundStore.js';
import { isFundPinned, addWatchlistItem, removeWatchlistItem } from '../watchlist/watchlist-store.js';
import { api } from '../api.js';
import { openConfirm } from '../confirmStore.js';
import { taggedLog } from '../log.js';
import { FundCardSparkline } from './FundCardSparkline.jsx';

const log = taggedLog("[funds]");

const CATEGORY_LABEL = {
  stock: { label: '股票' },
  bond:  { label: '债券' },
  money: { label: '货币' },
  qdii:  { label: 'QDII' },
  other: { label: '其他' },
};

function fmtNum(n, digits = 4) {
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

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

export function FundCard({ row }) {
  const [expanded, setExpanded] = useState(false);

  const holding = row.holding;
  const metrics = row.metrics;
  const navSnap = row.navSnap;
  const rawNavSnap = row.rawNavSnap;
  const cat = CATEGORY_LABEL[holding.category] || CATEGORY_LABEL.other;
  const errors = (navCache.value && navCache.value.errors) || {};
  const errMsg = errors[holding.code];
  const pendingNav = !holding.costNav || holding.costNav === 0;
  const source = navSource.value;
  const sourceShort = source === 'sina' ? '新浪' : '天天';
  const sourceUnavailable =
    source === 'sina' && rawNavSnap && rawNavSnap.altAvailable === false;
  const pinned = isFundPinned(holding.code);
  const togglePin = (e) => {
    e.stopPropagation();
    if (pinned) removeWatchlistItem({ type: 'fund', ref: holding.code });
    else addWatchlistItem({ type: 'fund', ref: holding.code });
  };

  async function handleBackfill() {
    if (!holding.code) return;
    await backfillFund(api, holding.code);
  }

  async function handleRemove() {
    const r = await removeFund(api, holding.id);
    if (!r.ok) {
      log.warn('remove failed:', r);
    }
  }

  async function confirmRemove(e) {
    e.stopPropagation();
    const ok = await openConfirm({
      title: '删除持仓',
      message: `确定删除 ${holding.name}？7 天内可在回收站恢复`,
      confirmText: '删除',
      cancelText: '取消',
    });
    if (ok) await handleRemove();
  }

  return (
    <div class="fund-card" data-fund-code={holding.code}>
      <div class="fund-card-header">
        <span
          class="fund-card-dot"
          style={{ background: `var(--cat-${holding.category})` }}
          title={cat.label}
          aria-hidden="true"
        />
        <span class="fund-card-code">{holding.code}</span>
        <span class="fund-card-name">{holding.name}</span>
        <span class="fund-card-actions">
          <button
            type="button"
            class={`fund-card-action-btn${pinned ? ' fund-card-action-btn--active' : ''}`}
            title={pinned ? '取消关注' : '关注净值'}
            onClick={togglePin}
          >
            关注
          </button>
          <button
            type="button"
            class="fund-card-action-btn"
            title="编辑"
            onClick={(e) => { e.stopPropagation(); openEditModal(holding); }}
          >
            编辑
          </button>
          <button
            type="button"
            class="fund-card-action-btn"
            title="删除"
            onClick={confirmRemove}
          >
            删除
          </button>
        </span>
      </div>

      {pendingNav ? (
        <div class="fund-card-metrics fund-card-pending-msg">
          净值还没拉到, 5 分钟内会自动反推成本.
          {navSnap && (navSnap.nav > 0 || navSnap.estimatedNav > 0) && (
            <button type="button" class="fund-card-pending-btn" onClick={handleBackfill}>
              立即用当前净值反推
            </button>
          )}
        </div>
      ) : sourceUnavailable ? (
        <div class="fund-card-metrics fund-card-err-msg">
          新浪财经数据不可用，请切换{NAV_SOURCE_LABELS.tiantian}或稍后刷新
        </div>
      ) : errMsg ? (
        <div class="fund-card-metrics fund-card-err-msg">
          净值拉取失败 ({errMsg}), UI 数据可能过期
        </div>
      ) : (
        <div class="fund-card-metrics">
          <span class="fund-card-stat">
            <span class="fund-card-stat-label">净值 ({sourceShort})</span>
            <span class="fund-card-stat-value">
              {fmtNum(metrics.usingEstimate ? (navSnap && navSnap.estimatedNav) : (navSnap && navSnap.nav), 4)}
              {metrics.usingEstimate && <span class="fund-card-est-tag" title="今日盘中估值">估值</span>}
            </span>
          </span>
          <span class="fund-card-stat">
            <span class="fund-card-stat-label">市值</span>
            <span class="fund-card-stat-value">{fmtCurrency(metrics.marketValue)}</span>
          </span>
          <span class="fund-card-stat">
            <span class="fund-card-stat-label">盈亏</span>
            <span class={`fund-card-stat-value ${metrics.profit >= 0 ? 'positive' : 'negative'}`}>
              {fmtCurrency(metrics.profit)} ({fmtPct(metrics.profitPct)})
            </span>
          </span>
          <span class="fund-card-stat">
            <span class="fund-card-stat-label">今日</span>
            <span class={`fund-card-stat-value ${metrics.todayProfit >= 0 ? 'positive' : 'negative'}`}>
              {fmtCurrency(metrics.todayProfit)} ({fmtPct(metrics.todayProfit / Math.max(metrics.costValue, 1))})
            </span>
          </span>
        </div>
      )}

      <FundCardSparkline code={holding.code} />

      <button
        type="button"
        class="fund-card-toggle"
        onClick={() => setExpanded(!expanded)}
        title={expanded ? '收起' : '展开'}
        aria-label={expanded ? '收起' : '展开'}
      >
        {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div class="fund-card-detail">
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">添加时间</span>
            <span class="fund-card-detail-value">
              {holding.addedAt ? new Date(holding.addedAt).toLocaleString('zh-CN') : '--'}
            </span>
          </div>
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">份额</span>
            <span class="fund-card-detail-value">{fmtNum(holding.shares, 2)}</span>
          </div>
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">成本净值</span>
            <span class="fund-card-detail-value">{fmtNum(holding.costNav, 4)}</span>
          </div>
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">成本总值</span>
            <span class="fund-card-detail-value">{fmtCurrency(metrics.costValue)}</span>
          </div>
          {holding.note && (
            <div class="fund-card-detail-row">
              <span class="fund-card-detail-label">备注</span>
              <span class="fund-card-detail-value">{holding.note}</span>
            </div>
          )}
          <button type="button" class="fund-card-backfill-btn" onClick={handleBackfill}>
            用当前净值反推成本
          </button>
        </div>
      )}
    </div>
  );
}

export default FundCard;
