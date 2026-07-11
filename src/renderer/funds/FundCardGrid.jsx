/**
 * src/renderer/funds/FundCardGrid.jsx
 *
 * 持仓卡片网格 — 替换 FundList. 按 filteredRows 渲染 FundCard, 空状态.
 */

import { filteredRows } from './fundStore.js';
import { FundCard } from './FundCard.jsx';

export function FundCardGrid() {
  const rows = filteredRows.value;
  if (!rows || rows.length === 0) {
    return (
      <div class="fund-empty-state">
        <p>还没有持仓，点右上角「＋ 添加持仓」开始。</p>
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
