/**
 * src/renderer/components/CategoryTabs.jsx
 *
 * Phase A4a (App Categorization): 顶部 8 类 tab 组件.
 *
 * 跟 FilterBar 的 chip 风格不同: CategoryTabs 用底部下划线风格
 * (spec §5.4) — 8+ 个 tab 不挤, 跟 macOS 偏好设置风格一致.
 *
 * 数据流:
 *   - 父组件 (ResultsView) 调 getCategoryTabsWithCount(results.value) 算 tabs
 *   - 传 props: tabs / active / onSelect
 *   - 自身不维护 state, 完全受控
 */

export function CategoryTabs({ tabs, active, onSelect }) {
  // null/undefined → 不渲染容器 (父组件会自己处理 hidden)
  if (!tabs) return null;
  return (
    <div class="category-tabs" role="tablist" aria-label="应用分类">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          class={`category-tab${active === t.id ? ' active' : ''}`}
          onClick={() => onSelect && onSelect(t.id)}
          title={t.title || t.name}
          role="tab"
          aria-selected={active === t.id}
        >
          <span class="category-tab-icon">{t.icon}</span>
          <span class="category-tab-name">{t.name}</span>
          <span class="category-tab-count">({t.count})</span>
        </button>
      ))}
    </div>
  );
}
