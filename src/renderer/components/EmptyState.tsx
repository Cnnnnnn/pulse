/**
 * EmptyState / PanelEmpty / DrawerEmpty — 列表 / 抽屉 / 面板空态统一.
 */
import type { ComponentChildren } from "preact";
import { searchQuery, activeFilter } from "../store.ts";
import { IconPackage, IconSearch } from "./icons.tsx";

export function EmptyState({ filtered = false }: { filtered?: boolean }) {
  if (!filtered) {
    return <PanelEmpty icon={<IconPackage size={32} />} title="暂无数据" />;
  }

  function clearFilter() {
    searchQuery.value = "";
    activeFilter.value = "all";
  }

  return (
    <PanelEmpty
      className="empty-state empty-state-filtered"
      icon={<IconSearch size={32} />}
      title="无匹配项"
      action={
        <button class="btn btn-secondary btn-sm" onClick={clearFilter}>
          清除过滤
        </button>
      }
    />
  );
}

/** 面板级空态 (基金/金属/提醒等). variant 给图标加圆形彩色背景. */
export function PanelEmpty({
  icon = null,
  title,
  hint = null,
  action = null,
  variant = null,
  className = "empty-state",
  children,
}: {
  icon?: ComponentChildren;
  title?: string;
  hint?: ComponentChildren;
  action?: ComponentChildren;
  variant?: string | null;
  className?: string;
  children?: ComponentChildren;
}) {
  if (children) {
    return <div class={className}>{children}</div>;
  }
  const variantCls = variant ? ` empty-state--${variant}` : "";
  return (
    <div class={`${className}${variantCls}`}>
      {icon && (
        <div class={`empty-icon${variant ? ` empty-icon--${variant}` : ""}`}>
          {icon}
        </div>
      )}
      {title && <p class="empty-title">{title}</p>}
      {hint && <p class="empty-hint">{hint}</p>}
      {action}
    </div>
  );
}

/** 抽屉内单行空态 */
export function DrawerEmpty({
  message,
  hint = null,
  className = "drawer-empty",
}: {
  message?: ComponentChildren;
  hint?: ComponentChildren;
  className?: string;
}) {
  return (
    <div class={className}>
      <p>{message}</p>
      {hint ? <p class="hint">{hint}</p> : null}
    </div>
  );
}
