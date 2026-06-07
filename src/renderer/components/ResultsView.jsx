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
 */

import { results } from '../store.js';
import { filteredResultsBySection } from '../selectors.js';
import { Section } from './Section.jsx';
import { EmptyState } from './EmptyState.jsx';

export function ResultsView() {
  const sections = filteredResultsBySection.value;
  const hasAnyResults = results.value.size > 0;
  if (sections.length === 0) return <EmptyState filtered={hasAnyResults} />;
  return (
    <div class="results-container">
      {sections.map((s) => (
        <Section key={s.key} section={s} />
      ))}
    </div>
  );
}
