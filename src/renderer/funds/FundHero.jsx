/**
 * src/renderer/funds/FundHero.jsx
 *
 * 组合 Hero 区 (三栏布局的顶栏): 取代 FundHeader 的总览角色.
 *   1. 顶部工具条: 品牌 + 次级工具 (净值源切换 / 提醒 / 刷新)
 *   2. 搜索 + 添加持仓行
 *   3. 总市值大数字 + 行内子指标 (今日预估 / 总盈亏 / 收益率)
 *   4. 右侧可视化列: 配置 donut + 近 30 天走势
 *
 * CSS 在后续任务统一接入, 这里只用语义 class.
 */

import {
  totalMetrics,
  navSource,
  searchQuery,
  setSearchQuery,
  openAddModal,
  openAlertModal,
  setNavSource,
  fetchNavNow,
  NAV_SOURCE_LABELS,
  fundsRefreshing,
  fundsRefreshError,
  navCache,
} from './fundStore.js';
import { api } from '../api.js';
import { IconBell, IconCoin, IconRefresh } from '../components/icons.jsx';
import { FundAllocationDonut } from './FundAllocationDonut.jsx';
import { FundPortfolioTrend } from './FundPortfolioTrend.jsx';
import { fmtCurrency, fmtPct } from '../../funds/format.js';

function fmtAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}

function arrow(n) {
  return n > 0 ? '↑' : n < 0 ? '↓' : '·';
}

export function FundHero() {
  const m = totalMetrics.value;
  const source = navSource.value;

  async function handleRefresh() {
    await fetchNavNow(api);
  }

  const totalMarketValue = Number(m.totalMarketValue) || 0;
  const todayProfit = Number(m.todayProfit) || 0;
  const totalProfit = Number(m.totalProfit) || 0;
  // 今日预估百分比 (参照 FundHeader: 今日盈亏 / 总市值)
  const todayProfitPct =
    totalMarketValue > 0 ? (todayProfit / totalMarketValue) * 100 : 0;
  // 收益率 = 总盈亏 / 总成本 (等于 totalProfitPct)
  const returnRate = Number(m.totalProfitPct) || 0;

  const signClass = (n) => (n >= 0 ? 'positive' : 'negative');

  return (
    <div class="fund-hero">
      {/* 1. 顶部工具条 (次级工具做视觉弱化处理) */}
      <div class="fund-hero-toolbar">
        <div class="fund-hero-brand">
          <span class="fund-hero-icon" aria-hidden="true">
            <IconCoin size={20} />
          </span>
          <h2 class="fund-hero-title">基金管理</h2>
        </div>
        <div class="fund-hero-actions">
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
          <button
            type="button"
            class="fund-btn fund-btn-ghost"
            onClick={() => openAlertModal()}
            title="盈亏阈值提醒"
            aria-label="盈亏阈值提醒"
          >
            <IconBell size={16} />
          </button>
          <button
            type="button"
            class="fund-btn fund-btn-ghost"
            onClick={() => void handleRefresh()}
            title="立即刷新净值"
            aria-label="立即刷新净值"
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      <div class="fund-hero-status" aria-live="polite">
        {fundsRefreshing.value
          ? '刷新中…'
          : fundsRefreshError.value
            ? <span class="fund-hero-status--error">刷新失败：{fundsRefreshError.value} <button type="button" class="fund-status-retry" onClick={() => void handleRefresh()} aria-label="重试刷新">重试</button></span>
            : navCache.value.fetchedAt
              ? `最后同步 ${fmtAgo(navCache.value.fetchedAt)}`
              : '尚未同步'}
      </div>

      {/* 2. 总览 KPI 条: 总市值巨号 + 今日/总盈亏/收益率三块磁贴 */}
      <div class="fund-hero-kpi">
        <div class="fund-hero-kpi-primary">
          <span class="fund-hero-kpi-label">总市值</span>
          <span class="fund-hero-total tabular-nums">{fmtCurrency(totalMarketValue)}</span>
          <span class="fund-hero-kpi-hint">持仓市值汇总</span>
        </div>
        <div class="fund-hero-kpi-tile">
          <span class="fund-hero-kpi-label">今日预估</span>
          <span class={`fund-hero-kpi-value ${signClass(todayProfit)}`}>
            <span class="fund-hero-kpi-arrow" aria-hidden="true">{arrow(todayProfit)}</span>
            {fmtCurrency(todayProfit)}
          </span>
          <span class={`fund-hero-kpi-sub ${signClass(todayProfitPct)}`}>{fmtPct(todayProfitPct)}</span>
        </div>
        <div class="fund-hero-kpi-tile">
          <span class="fund-hero-kpi-label">总盈亏</span>
          <span class={`fund-hero-kpi-value ${signClass(totalProfit)}`}>
            <span class="fund-hero-kpi-arrow" aria-hidden="true">{arrow(totalProfit)}</span>
            {fmtCurrency(totalProfit)}
          </span>
          <span class={`fund-hero-kpi-sub ${signClass(totalProfit)}`}>{fmtPct(m.totalProfitPct || 0)}</span>
        </div>
        <div class="fund-hero-kpi-tile">
          <span class="fund-hero-kpi-label">收益率</span>
          <span class={`fund-hero-kpi-value ${signClass(returnRate)}`}>{fmtPct(returnRate)}</span>
        </div>
      </div>

      {/* 3. 可视化带: 配置环 + 近 30 天走势 */}
      <div class="fund-hero-panels">
        <div class="fund-hero-panel">
          <FundAllocationDonut />
        </div>
        <div class="fund-hero-panel">
          <FundPortfolioTrend />
        </div>
      </div>

      {/* 3. 搜索 + 添加持仓 (工具行置于底部, 不抢占视觉焦点) */}
      <div class="fund-hero-search">
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
          ＋ 添加持仓
        </button>
      </div>
    </div>
  );
}

export default FundHero;
