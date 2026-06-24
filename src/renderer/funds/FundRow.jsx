/**
 * src/renderer/funds/FundRow.jsx
 *
 * 单只基金行 — 显示代码 / 名称 / 份额 / 成本 / 净值 / 市值 / 盈亏 / 今日预估.
 *
 * 错误态 (单只拉取失败): 显示 ⚠️ + 错误信息.
 */

import { useState } from 'preact/hooks';
import { navCache, navSource, NAV_SOURCE_LABELS, openEditModal, removeFund, backfillFund } from './fundStore.js';
import { isFundPinned, addWatchlistItem, removeWatchlistItem } from '../watchlist/watchlist-store.js';
import { api } from '../api.js';
import { taggedLog } from '../log.js';

const log = taggedLog("[funds]");

const CATEGORY_LABEL = {
  stock: { icon: '📈', label: '股票' },
  bond:  { icon: '📊', label: '债券' },
  money: { icon: '💵', label: '货币' },
  qdii:  { icon: '🌏', label: 'QDII' },
  other: { icon: '📦', label: '其他' },
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

export function FundRow({ row }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
    setConfirmRemove(false);
  }

  return (
    <div class={`fund-row${errMsg ? ' fund-row-error' : ''}${pendingNav ? ' fund-row-pending' : ''}`} data-fund-code={holding.code}>
      <div class="fund-row-main">
        <div class="fund-row-info">
          <div class="fund-row-line1">
            <span class="fund-row-code">{holding.code}</span>
            <span class="fund-row-name">{holding.name}</span>
            <span class="fund-row-category" title={cat.label}>
              <span class="fund-row-cat-icon">{cat.icon}</span>
              {cat.label}
            </span>
            <span class="fund-row-actions">
              <button
                type="button"
                class={`fund-row-action-btn${pinned ? ' fund-row-action-btn--active' : ''}`}
                title={pinned ? '取消关注' : '关注净值'}
                onClick={togglePin}
              >
                {pinned ? '★' : '☆'}
              </button>
              <button
                type="button"
                class="fund-row-action-btn"
                title="编辑"
                onClick={(e) => { e.stopPropagation(); openEditModal(holding); }}
              >
                ✎
              </button>
              <button
                type="button"
                class="fund-row-action-btn"
                title="删除"
                onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }}
              >
                🗑
              </button>
            </span>
          </div>
          <div class="fund-row-line2">
            {pendingNav
              ? <>买入金额 {fmtCurrency(holding._amount || 0)} · 成本待反推</>
              : <>持有 {fmtNum(holding.shares, 2)} 份 · 成本 {fmtNum(holding.costNav, 4)}</>}
          </div>
        </div>
        {pendingNav ? (
          <div class="fund-row-metrics fund-row-pending-msg">
            <span class="fund-row-pending-icon">⏳</span>
            净值还没拉到, 5 分钟内会自动反推成本.
            {navSnap && (navSnap.nav > 0 || navSnap.estimatedNav > 0) && (
              <button
                type="button"
                class="fund-row-pending-btn"
                onClick={handleBackfill}
              >
                立即用当前净值反推
              </button>
            )}
          </div>
        ) : sourceUnavailable ? (
          <div class="fund-row-metrics fund-row-err-msg">
            <span class="fund-row-err-icon">⚠️</span>
            新浪财经数据不可用，请切换{NAV_SOURCE_LABELS.tiantian}或稍后刷新
          </div>
        ) : errMsg ? (
          <div class="fund-row-metrics fund-row-err-msg">
            <span class="fund-row-err-icon">⚠️</span>
            净值拉取失败 ({errMsg}), UI 数据可能过期
          </div>
        ) : (
          <div class="fund-row-metrics">
            <span class="fund-row-stat fund-row-stat-nav">
              <span class="fund-row-stat-label">净值 ({sourceShort})</span>
              <span class="fund-row-stat-value">{fmtNum(metrics.usingEstimate ? navSnap && navSnap.estimatedNav : navSnap && navSnap.nav, 4)}</span>
              {metrics.usingEstimate && <span class="fund-row-est-tag" title="今日盘中估值">估值</span>}
            </span>
            <span class="fund-row-stat">
              <span class="fund-row-stat-label">市值</span>
              <span class="fund-row-stat-value">{fmtCurrency(metrics.marketValue)}</span>
            </span>
            <span class="fund-row-stat">
              <span class="fund-row-stat-label">盈亏</span>
              <span class={`fund-row-stat-value ${metrics.profit >= 0 ? 'positive' : 'negative'}`}>
                {fmtCurrency(metrics.profit)} ({fmtPct(metrics.profitPct)})
              </span>
            </span>
            <span class="fund-row-stat">
              <span class="fund-row-stat-label">今日</span>
              <span class={`fund-row-stat-value ${metrics.todayProfit >= 0 ? 'positive' : 'negative'}`}>
                {fmtCurrency(metrics.todayProfit)} ({fmtPct(metrics.todayProfit / Math.max(metrics.costValue, 1))})
              </span>
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        class="fund-row-toggle"
        onClick={() => setExpanded(!expanded)}
        title={expanded ? '收起' : '展开'}
        aria-label={expanded ? '收起' : '展开'}
      >
        {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div class="fund-row-detail">
          <div class="fund-row-detail-row">
            <span class="fund-row-detail-label">添加时间</span>
            <span class="fund-row-detail-value">
              {holding.addedAt ? new Date(holding.addedAt).toLocaleString('zh-CN') : '--'}
            </span>
          </div>
          <div class="fund-row-detail-row">
            <span class="fund-row-detail-label">份额</span>
            <span class="fund-row-detail-value">{fmtNum(holding.shares, 2)}</span>
          </div>
          <div class="fund-row-detail-row">
            <span class="fund-row-detail-label">成本净值</span>
            <span class="fund-row-detail-value">{fmtNum(holding.costNav, 4)}</span>
          </div>
          <div class="fund-row-detail-row">
            <span class="fund-row-detail-label">成本总值</span>
            <span class="fund-row-detail-value">{fmtCurrency(metrics.costValue)}</span>
          </div>
          {rawNavSnap && source === 'tiantian' && rawNavSnap.altAvailable && (
            <div class="fund-row-detail-row">
              <span class="fund-row-detail-label">新浪 (参考)</span>
              <span class="fund-row-detail-value">
                {fmtNum(rawNavSnap.altEstimatedNav || rawNavSnap.altNav, 4)}
                {rawNavSnap.altDayChangePct != null && ` (${fmtPct(rawNavSnap.altDayChangePct)})`}
              </span>
            </div>
          )}
          {rawNavSnap && source === 'sina' && rawNavSnap.nav > 0 && (
            <div class="fund-row-detail-row">
              <span class="fund-row-detail-label">天天 (参考)</span>
              <span class="fund-row-detail-value">
                {fmtNum(rawNavSnap.estimatedNav || rawNavSnap.nav, 4)}
                {rawNavSnap.dayChangePct != null && ` (${fmtPct(rawNavSnap.dayChangePct)})`}
              </span>
            </div>
          )}
          {holding.note && (
            <div class="fund-row-detail-row">
              <span class="fund-row-detail-label">备注</span>
              <span class="fund-row-detail-value">{holding.note}</span>
            </div>
          )}
        </div>
      )}

      {confirmRemove && (
        <div class="fund-confirm-overlay" onClick={() => setConfirmRemove(false)}>
          <div class="fund-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div class="fund-confirm-title">删除持仓</div>
            <div class="fund-confirm-body">
              确定删除 <b>{holding.name}</b>?
              <div class="fund-confirm-sub">7 天内可在回收站恢复</div>
            </div>
            <div class="fund-confirm-actions">
              <button
                type="button"
                class="fund-btn fund-btn-ghost"
                onClick={() => setConfirmRemove(false)}
              >
                取消
              </button>
              <button
                type="button"
                class="fund-btn fund-btn-danger"
                onClick={handleRemove}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FundRow;