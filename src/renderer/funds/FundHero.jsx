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
} from './fundStore.js';
import { api } from '../api.js';
import { IconBell, IconCoin, IconRefresh } from '../components/icons.jsx';
import { FundAllocationDonut } from './FundAllocationDonut.jsx';
import { FundPortfolioTrend } from './FundPortfolioTrend.jsx';

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

function arrow(n) {
  return n > 0 ? '↑' : n < 0 ? '↓' : '·';
}

export function FundHero() {
  const m = totalMetrics.value;
  const source = navSource.value;

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
            onClick={() => fetchNavNow(api)}
            title="立即刷新净值"
            aria-label="立即刷新净值"
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      {/* 2. 搜索 + 添加持仓 */}
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

      {/* 3 + 4. 总市值大数字 (左) + 右侧可视化列 (右) */}
      <div class="fund-hero-main">
        <div class="fund-hero-number">
          <div class="fund-hero-total tabular-nums">{fmtCurrency(totalMarketValue)}</div>
          <div class="fund-hero-subs">
            <span class={`fund-hero-sub ${signClass(todayProfit)}`}>
              今日预估 {arrow(todayProfit)} {fmtCurrency(todayProfit)} ({fmtPct(todayProfitPct)})
            </span>
            <span class={`fund-hero-sub ${signClass(totalProfit)}`}>
              总盈亏 {arrow(totalProfit)} {fmtCurrency(totalProfit)} ({fmtPct(m.totalProfitPct || 0)})
            </span>
            <span class={`fund-hero-sub ${signClass(returnRate)}`}>
              收益率 {fmtPct(returnRate)}
            </span>
          </div>
        </div>

        <div class="fund-hero-charts">
          <FundAllocationDonut />
          <FundPortfolioTrend />
        </div>
      </div>
    </div>
  );
}

export default FundHero;
