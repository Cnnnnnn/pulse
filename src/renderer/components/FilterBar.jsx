/**
 * src/renderer/components/FilterBar.jsx
 *
 * Phase 23: 顶部 FilterBar —— search input + 4 状态 tab.
 * 写 searchQuery / activeFilter signals, 读 tabCounts.
 *
 * 行为:
 *   - search 实时过滤 (case-insensitive, 匹配 name + bundle)
 *   - 4 tab 单选: 全部 / 有更新 / 已是最新 / 出错
 *   - Esc 清空 search (不清 tab)
 *   - 0 匹配由 EmptyState 处理 (在 ResultsView 那一层)
 *
 * 暴露外部 focus 方法 via forwarded ref? — 不需要, App.jsx 用 querySelector
 *   或 signal 'focusSearchRequest' 触发. 这里用后者, 简单点.
 */

import { searchQuery, activeFilter } from '../store.js';
import { tabCounts } from '../selectors.js';

const TABS = [
  { key: 'all',    label: '全部' },
  { key: 'update', label: '有更新' },
  { key: 'latest', label: '已是最新' },
  { key: 'error',  label: '出错' },
];

export function FilterBar() {
  const counts = tabCounts.value;
  const active = activeFilter.value;

  function onSearchInput(e) {
    searchQuery.value = e.target.value;
  }

  function onSearchKeyDown(e) {
    if (e.key === 'Escape') {
      searchQuery.value = '';
      e.preventDefault();
    }
  }

  function setTab(key) {
    if (activeFilter.value !== key) activeFilter.value = key;
  }

  return (
    <div class="filter-bar">
      <div class="filter-search">
        <input
          id="filter-search-input"
          type="text"
          class="filter-search-input"
          placeholder="搜索 app 名称…"
          value={searchQuery.value}
          onInput={onSearchInput}
          onKeyDown={onSearchKeyDown}
          aria-label="搜索 app 名称"
        />
        {searchQuery.value && (
          <button
            class="filter-search-clear"
            onClick={() => { searchQuery.value = ''; }}
            title="清空"
            aria-label="清空"
          >×</button>
        )}
      </div>
      <div class="filter-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            class={`filter-tab${active === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
            role="tab"
            aria-selected={active === t.key}
          >
            {t.label}
            <span class="count">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
