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
 *
 * Phase A5a: 键盘快捷键 — `1`-`9` 切对应 tab (按 tab 顺序, 0 切 "全部").
 *   input/textarea focus 时不抢, 跟 macOS 菜单栏快捷键不冲突.
 */

import { useEffect } from 'preact/hooks';
import { computed } from '@preact/signals';
import { results, activeCategory, setActiveCategory } from '../store.js';
import { filteredResultsBySection } from '../selectors.js';
import { getCategoryTabsWithCount } from '../../config/category.js';
import { Section } from './Section.jsx';
import { CategoryTabs } from './CategoryTabs.jsx';
import { EmptyState } from './EmptyState.jsx';

// tabs: 按 results.value 算 (跟 activeCategory 解耦, 但 use results 作为订阅源)
const tabs = computed(() => getCategoryTabsWithCount(results.value));

function isTypingInForm(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

export function ResultsView() {
  const sections = filteredResultsBySection.value;
  const hasAnyResults = results.value.size > 0;
  const active = activeCategory.value;
  const tabList = tabs.value;

  // Phase A5a: 数字键 0-9 切 tab (按 tab 顺序). 0 = "全部", 1-9 = 第 1-9 个 tab.
  useEffect(() => {
    function onKey(e) {
      // input/textarea focus 时不抢
      if (isTypingInForm(e.target)) return;
      // 不抢 Cmd/Ctrl + 数字 (留作未来全局快捷键)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 只看主键区数字 (主键盘 0-9, 不含小键盘 — 小键盘用 Numpad0-9 区别)
      if (e.key < '0' || e.key > '9') return;
      const idx = parseInt(e.key, 10);
      if (idx < 0 || idx > 9) return;
      // 0 → "全部"; 1-9 → 第 idx 个 tab
      const targetId = idx === 0 ? 'all' : tabList[idx] && tabList[idx].id;
      if (!targetId) return;
      e.preventDefault();
      setActiveCategory(targetId);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabList]);

  return (
    <>
      {/* CategoryTabs 永远显示, 让用户能切到别的分类 (即使当前 sections 空).
        之前 sections.length === 0 → return EmptyState 整个跳掉 CategoryTabs,
        用户切到 '其他' tab 但 0 个 app 时就完全无法切回去. 修法: tabs 跟
        EmptyState 一起渲染. */}
      <CategoryTabs
        tabs={tabList}
        active={active}
        onSelect={setActiveCategory}
      />
      {sections.length === 0 ? (
        <EmptyState filtered={hasAnyResults} />
      ) : (
        <div class="results-container">
          {sections.map((s) => (
            <Section key={s.key} section={s} />
          ))}
        </div>
      )}
    </>
  );
}
