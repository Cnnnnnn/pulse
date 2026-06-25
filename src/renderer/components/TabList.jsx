/**
 * TabList / Tab — 统一 chip / underline / pill / date 四套 tab 视觉.
 * 复用现有 CSS class, 不新增样式体系.
 */

const VARIANT = {
  chip: { list: 'filter-tabs', tab: 'filter-tab', active: 'active', count: 'count' },
  underline: { list: 'category-tabs', tab: 'category-tab', active: 'active', count: 'category-tab-count', icon: 'category-tab-icon', name: 'category-tab-name' },
  pill: { list: 'recent-modal-filters', tab: 'recent-filter-pill', active: 'is-active' },
  date: { list: 'ai-tasks-date-row', tab: 'ai-tasks-date-chip', active: 'active' },
  config: { list: 'ai-config-tabs', tab: 'ai-config-tab', active: 'active' },
};

export function TabList({
  variant = 'chip',
  className = '',
  role = 'tablist',
  ariaLabel,
  children,
}) {
  const v = VARIANT[variant] || VARIANT.chip;
  return (
    <div class={`${v.list}${className ? ` ${className}` : ''}`} role={role} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function Tab({
  variant = 'chip',
  active = false,
  onClick,
  count,
  icon,
  title,
  role = 'tab',
  ariaSelected,
  className = '',
  children,
}) {
  const v = VARIANT[variant] || VARIANT.chip;
  const activeClass = active ? ` ${v.active}` : '';
  const selected = ariaSelected != null ? ariaSelected : active;

  if (variant === 'underline') {
    return (
      <button
        type="button"
        class={`${v.tab}${activeClass}${className ? ` ${className}` : ''}`}
        onClick={onClick}
        title={title}
        role={role}
        aria-selected={selected}
      >
        {icon != null && <span class={v.icon}>{icon}</span>}
        <span class={v.name}>{children}</span>
        {count != null && <span class={v.count}>({count})</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      class={`${v.tab}${activeClass}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      title={title}
      role={role}
      aria-selected={selected}
    >
      {children}
      {count != null && variant === 'chip' && <span class={v.count}>{count}</span>}
    </button>
  );
}
