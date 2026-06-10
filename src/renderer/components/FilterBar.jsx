/**
 * src/renderer/components/FilterBar.jsx
 *
 * Phase 23: 顶部 FilterBar —— search input + 4 状态 tab.
 * v2.7.0: 加 2 个 library chip: ⭐ 我关注的 / 📦 未监控
 * 写 searchQuery / activeFilter signals, 读 tabCounts.
 *
 * 行为:
 *   - search 实时过滤 (case-insensitive, 匹配 name + bundle)
 *   - 6 tab/chip 单选: 全部 / 有更新 / 已是最新 / 出错 / 我关注的 / 未监控
 *   - Esc 清空 search (不清 tab)
 *   - 0 匹配由 EmptyState 处理 (在 ResultsView 那一层)
 *   - '未监控' 模式由 LibrarySection 单独渲染, ResultsView 隐藏
 */

import { searchQuery, activeFilter, unmonitoredApps } from '../store.js';
import { tabCounts } from '../selectors.js';

const TABS = [
  { key: 'all',         label: '全部' },
  { key: 'update',      label: '有更新' },
  { key: 'latest',      label: '已是最新' },
  { key: 'error',       label: '出错' },
];

// v2.7.0: library 视角的 chip (跟 status tab 用不同 class 区分)
const LIBRARY_TABS = [
  { key: 'starred',     label: '⭐ 我关注的' },
  { key: 'unmonitored', label: '📦 未监控' },
];

export function FilterBar() {
  const counts = tabCounts.value;
  const active = activeFilter.value;
  const unmonitoredCount = unmonitoredApps.value.length;

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
        <span class="filter-tab-sep" aria-hidden="true">|</span>
        {LIBRARY_TABS.map((t) => (
          <button
            key={t.key}
            class={`filter-chip${active === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
            role="tab"
            aria-selected={active === t.key}
            title={t.key === 'unmonitored' ? '显示 /Applications 跟 ~/Applications 里装了但没在 config 里的 app' : '显示我加 ⭐ 的 app'}
          >
            {t.label}
            <span class="count">
              {t.key === 'unmonitored' ? unmonitoredCount : (counts[t.key] || 0)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
