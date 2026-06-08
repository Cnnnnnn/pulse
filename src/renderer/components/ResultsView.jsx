/**
 * src/renderer/components/ResultsView.jsx
 *
 * 跟 filteredResultsBySection 一起工作：每个 section 渲染一次。
 * 订阅 filteredResultsBySection.value —— 任何 applyProgress / search / tab
 * 变化都会让它重算，但 Section 内部用稳定 key，AppRow 内部的 per-row signal
 * 决定了 "只该 row 重渲染" 的不变量。
 *
 * Phase 23: 改用 filteredResultsBySection (filter-aware). 0 匹配时 EmptyState
 *   区分 "无数据" vs "无匹配" (后者显示 清除过滤 按钮).
 *
 * Phase A4b: 顶部插 <CategoryTabs />, 跟 search/tab 过滤器正交.
 *   - CategoryTabs 受控: 自身不维护 state, active / onSelect 由 store.js 提供
 *   - tabs = computed(getCategoryTabsWithCount(results.value))
 *     跟 activeCategory 解耦 (tab 列表本身不随 activeCategory 变化, 只随
 *     results 变化 — hide-empty + count 重新算)
 *   - filteredResultsBySection 已经在 selectors.js 注入 activeCategory 过滤
 *     (Phase A3), SectionList 输入已经过滤过, 这里不需要再 filter
 */

import { computed } from '@preact/signals';
import { results, activeCategory, setActiveCategory } from '../store.js';
import { filteredResultsBySection } from '../selectors.js';
import { getCategoryTabsWithCount } from '../../config/category.js';
import { Section } from './Section.jsx';
import { CategoryTabs } from './CategoryTabs.jsx';
import { EmptyState } from './EmptyState.jsx';

// tabs: 按 results.value 算 (跟 activeCategory 解耦, 但 use results 作为订阅源)
const tabs = computed(() => getCategoryTabsWithCount(results.value));

export function ResultsView() {
  const sections = filteredResultsBySection.value;
  const hasAnyResults = results.value.size > 0;
  const active = activeCategory.value;
  if (sections.length === 0) return <EmptyState filtered={hasAnyResults} />;
  return (
    <>
      <CategoryTabs
        tabs={tabs.value}
        active={active}
        onSelect={setActiveCategory}
      />
      <div class="results-container">
        {sections.map((s) => (
          <Section key={s.key} section={s} />
        ))}
      </div>
    </>
  );
}
