/**
 * SubtabList — 通用 "横向子标签" 容器, 调用方通过 prefix 与 renderLabel 控制形态.
 *
 * ponytail: 2026-07-08 — 抽取 WorldcupHeader / NewsHeader 两处的 inline sub-tab 列表,
 *   className 模式: 容器 {prefix}-subtabs + 按钮 {prefix}-subtab + 激活态 {prefix}-subtab-active.
 *   StockLayout 那一处 a11y 比较特殊 (aria-controls/tabIndex/onKeyDown) 不迁, 避免反向复杂化.
 *
 * 用法:
 *   <SubtabList prefix="worldcup" tabs={subTabs} activeKey={subTab} onChange={onSubTabChange}
 *               ariaLabel="视图切换">
 *     {(t) => <><Icon /><span>{t.label}</span></>}
 *   </SubtabList>
 */
export function SubtabList({
  prefix,
  tabs,
  activeKey,
  onChange,
  ariaLabel,
  children,  // (tab) => JSX
}) {
  return (
    <div class={`${prefix}-subtabs`} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            class={`${prefix}-subtab${active ? ` ${prefix}-subtab-active` : ""}`}
            onClick={() => onChange && onChange(t.key)}
          >
            {children ? children(t) : t.label}
          </button>
        );
      })}
    </div>
  );
}

export default SubtabList;
