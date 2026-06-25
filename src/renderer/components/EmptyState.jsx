/**
 * EmptyState / PanelEmpty / DrawerEmpty — 列表 / 抽屉 / 面板空态统一.
 */
import { searchQuery, activeFilter } from '../store.js';
import { IconPackage, IconSearch } from './icons.jsx';

export function EmptyState({ filtered = false }) {
  if (!filtered) {
    return (
      <PanelEmpty
        icon={<IconPackage size={32} />}
        title="暂无数据"
      />
    );
  }

  function clearFilter() {
    searchQuery.value = '';
    activeFilter.value = 'all';
  }

  return (
    <PanelEmpty
      className="empty-state empty-state-filtered"
      icon={<IconSearch size={32} />}
      title="无匹配项"
      action={(
        <button class="btn btn-secondary btn-sm" onClick={clearFilter}>
          清除过滤
        </button>
      )}
    />
  );
}

/** 面板级空态 (基金/金属/提醒等) */
export function PanelEmpty({
  icon = null,
  title,
  hint = null,
  action = null,
  className = 'empty-state',
  children,
}) {
  if (children) {
    return <div class={className}>{children}</div>;
  }
  return (
    <div class={className}>
      {icon && <div class="empty-icon">{icon}</div>}
      {title && <p class="empty-title">{title}</p>}
      {hint && <p class="empty-hint">{hint}</p>}
      {action}
    </div>
  );
}

/** 抽屉内单行空态 */
export function DrawerEmpty({ message, hint = null, className = 'drawer-empty' }) {
  return (
    <div class={className}>
      <p>{message}</p>
      {hint ? <p class="hint">{hint}</p> : null}
    </div>
  );
}
