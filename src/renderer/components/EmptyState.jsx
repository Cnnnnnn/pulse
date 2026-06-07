/**
 * src/renderer/components/EmptyState.jsx
 *
 * Phase 23: 区分两种 empty state:
 *   - filtered=false: 暂无数据 (check 没跑过 / 全失败)
 *   - filtered=true:  0 匹配 (有数据但被 search/tab 过滤光了) → 提示清除过滤
 */

import { searchQuery, activeFilter } from '../store.js';

export function EmptyState({ filtered = false }) {
  if (!filtered) {
    return (
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <p>暂无数据</p>
      </div>
    );
  }

  function clearFilter() {
    searchQuery.value = '';
    activeFilter.value = 'all';
  }

  return (
    <div class="empty-state empty-state-filtered">
      <div class="empty-icon">🔍</div>
      <p>无匹配项</p>
      <button class="btn btn-secondary btn-sm" onClick={clearFilter}>
        清除过滤
      </button>
    </div>
  );
}
