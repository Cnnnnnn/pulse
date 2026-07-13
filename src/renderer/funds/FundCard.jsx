/**
 * src/renderer/funds/FundCard.jsx
 *
 * 单只基金卡片 — 替换 FundRow. 保持 FundRow 的数据字段 / 格式化 / 状态机,
 * 卡片化布局 + 底部 NAV sparkline.
 *
 * 错误态 (单只拉取失败): 显示错误信息.
 */

import { useState } from 'preact/hooks';
import { navCache, navSource, NAV_SOURCE_LABELS, openEditModal, removeFund, backfillFund, isListedFundCode } from './fundStore.js';
import { isFundPinned, addWatchlistItem, removeWatchlistItem } from '../watchlist/watchlist-store.js';
import { api } from '../api.js';
import { openConfirm } from '../confirmStore.js';
import { taggedLog } from '../log.js';
import { FundCardSparkline } from './FundCardSparkline.jsx';
import { AddToCompareButton } from '../stocks/AddToCompareButton.jsx';
import { fmtCurrency, fmtPct, fmtNum } from '../../funds/format.js';

const log = taggedLog("[funds]");

const CATEGORY_LABEL = {
  stock: { label: '股票' },
  bond:  { label: '债券' },
  money: { label: '货币' },
  qdii:  { label: 'QDII' },
  other: { label: '其他' },
};

export function FundCard({ row }) {
  const [expanded, setExpanded] = useState(false);

  const holding = row.holding;
  const metrics = row.metrics;
  const navSnap = row.navSnap;

  // 阶段 A 派生展示: 容错取字段, 缺失时回退计算, 不抛错.
  const cumProfit = Number.isFinite(metrics && metrics.cumulativeProfit)
    ? metrics.cumulativeProfit
    : (metrics.marketValue || 0) - (metrics.costValue || 0);
  const annualized = metrics && metrics.annualizedPct;
  const annClass =
    annualized == null ? '' : annualized >= 0 ? 'positive' : 'negative';
  const holdingPeriodLabel = (() => {
    if (!holding || !holding.addedAt) return '--';
    const hd =
      metrics && Number.isFinite(metrics.holdingDays)
        ? metrics.holdingDays
        : null;
    if (hd != null) {
      return hd < 1 ? '今日建仓' : `${hd} 天`;
    }
    const t = Date.parse(holding.addedAt);
    if (!Number.isFinite(t)) return '--';
    const d = Math.floor((Date.now() - t) / 86400000);
    return d < 1 ? '今日建仓' : `${d} 天`;
  })();
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

  // ponytail 2026-07-13 投资 nav 合并 (N5): 仅 listed 基金可入对比池.
  //   场外开放式 (000xxx 等) 禁用 + tooltip, 避免点击后无场内 ETF 可映射.
  const listed = isListedFundCode(holding.code);
  const compareEntry = listed
    ? {
        kind: 'fund',
        code: holding.code,
        name: holding.name,
        marketValue: metrics && metrics.marketValue,
        profitPct: metrics && metrics.profitPct,
      }
    : null;

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
          {/* ponytail 2026-07-13: 加入对比池 — 仅 listed (场内 ETF/LOF) 启用 */}
          {listed && compareEntry ? (
            <AddToCompareButton entry={compareEntry} variant="row" api={api} />
          ) : (
            <button
              type="button"
              class="fund-card-action-btn fund-card-action-btn--disabled"
              disabled
              title="场外开放式基金无场内可比标的"
              aria-label="场外开放式基金无场内可比标的"
            >
              对比
            </button>
          )}
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
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">累计收益</span>
            <span class={`fund-card-detail-value ${cumProfit >= 0 ? 'positive' : 'negative'}`}>
              {fmtCurrency(cumProfit)}
            </span>
          </div>
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">持有期</span>
            <span class="fund-card-detail-value">{holdingPeriodLabel}</span>
          </div>
          <div class="fund-card-detail-row">
            <span class="fund-card-detail-label">年化</span>
            <span class={`fund-card-detail-value ${annClass}`}>
              {annualized == null ? '--' : fmtPct(annualized)}
            </span>
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
