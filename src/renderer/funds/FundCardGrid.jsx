/**
 * src/renderer/funds/FundCardGrid.jsx
 *
 * 持仓卡片网格 — 替换 FundList. 按 filteredRows 渲染 FundCard, 空状态三态分流.
 */

import {
  filteredRows,
  fundsLoading,
  fundsLoadError,
  loadFunds,
  searchQuery,
  activeCategory,
  openAddModal,
} from './fundStore.js';
import { api } from '../api.js';
import { FundCard } from './FundCard.jsx';

export function FundCardGrid() {
  const loading = fundsLoading.value;
  const err = fundsLoadError.value;
  const rows = filteredRows.value;

  if (loading) {
    return (
      <div class="fund-empty-state fund-empty-state--loading">
        <span class="fund-spinner" aria-hidden="true" /> 加载中…
      </div>
    );
  }
  if (err) {
    return (
      <div class="fund-empty-state fund-empty-state--error">
        加载失败：{err}
        <button type="button" class="fund-btn fund-btn-ghost" onClick={() => loadFunds(api)}>
          重试
        </button>
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    const isFiltered =
      !!((searchQuery.value || '').trim()) || activeCategory.value !== 'all';
    if (isFiltered) {
      return <div class="fund-empty-state">没有匹配的持仓</div>;
    }
    return (
      <div class="fund-empty-state">
        还没有持仓，
        <button type="button" class="fund-empty-cta" onClick={() => openAddModal()}>
          添加第一只基金
        </button>
      </div>
    );
  }
  return (
    <div class="fund-card-grid">
      {rows.map((row) => (
        <FundCard key={row.holding.id} row={row} />
      ))}
    </div>
  );
}

export default FundCardGrid;
