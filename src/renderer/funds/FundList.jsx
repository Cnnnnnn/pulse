/**
 * src/renderer/funds/FundList.jsx
 *
 * 持仓列表 — 按 filteredRows 渲染, 空状态.
 */

import { filteredRows, openAddModal } from './fundStore.js';
import { FundRow } from './FundRow.jsx';

export function FundList() {
  const rows = filteredRows.value;

  if (!rows || rows.length === 0) {
    return (
      <div class="fund-empty-state">
        <div class="fund-empty-icon">💰</div>
        <div class="fund-empty-title">还没添加持仓</div>
        <div class="fund-empty-sub">记录你的基金, 实时看盈亏</div>
        <button
          type="button"
          class="fund-btn fund-btn-primary fund-btn-lg"
          onClick={() => openAddModal()}
        >
          + 添加第一只基金
        </button>
      </div>
    );
  }

  return (
    <div class="fund-list">
      {rows.map((row) => (
        <FundRow key={row.holding.id} row={row} />
      ))}
    </div>
  );
}

export default FundList;