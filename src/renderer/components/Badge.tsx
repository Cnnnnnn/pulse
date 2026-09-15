/**
 * Badge — Header 角标 / 状态标签统一入口.
 */
import type { ComponentChildren } from "preact";

const TYPE_CLASS: Record<string, string> = {
  digest: "digest-badge",
  setup: "digest-badge setup-badge",
  reminder: "reminder-badge",
  navdrawer: "nav-drawer-badge",
  dot: "release-notes-trigger-badge",
  status: "status-badge",
};

export function Badge({
  type = "digest",
  className = "",
  children,
  title,
  ariaLabel,
  max,
}: {
  type?: string;
  className?: string;
  children?: ComponentChildren;
  title?: string;
  ariaLabel?: string;
  /** 超过 max 显示 `max+`；同时把真实值写到 title (hover tooltip). */
  max?: number;
}) {
  const base = TYPE_CLASS[type] || type;
  const raw = typeof children === "number" ? children : Number(children);
  const numeric = Number.isFinite(raw) ? raw : null;
  const capped =
    numeric != null && typeof max === "number" && max > 0 && numeric > max;
  const display =
    capped && numeric != null ? `${max}+` : children;
  const finalTitle =
    capped && numeric != null
      ? title
        ? `${title} · 真实值 ${numeric}`
        : `真实值 ${numeric}`
      : title;
  return (
    <span
      class={`${base}${className ? ` ${className}` : ""}${capped ? " badge-capped" : ""}`}
      title={finalTitle}
      aria-label={ariaLabel}
    >
      {display}
    </span>
  );
}

export function TaskStatusBadge({
  status,
  className = "",
  children,
}: {
  status?: string;
  className?: string;
  children?: ComponentChildren;
}) {
  return (
    <span
      class={`ai-task-status-badge ${status}${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}

/** status-badge 语义色修饰: update / latest / warning / error / info */
export function StatusBadge({
  status,
  className = "",
  children,
  title,
}: {
  status?: string;
  className?: string;
  children?: ComponentChildren;
  title?: string;
}) {
  const mod = status ? ` ${status}` : "";
  return (
    <span class={`status-badge${mod}${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </span>
  );
}
