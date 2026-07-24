/**
 * Badge — Header 角标 / 状态标签统一入口.
 */
import type { ComponentChildren } from "preact";

const TYPE_CLASS: Record<string, string> = {
  digest: "digest-badge",
  setup: "digest-badge setup-badge",
  reminder: "reminder-badge",
  sidenav: "side-nav-badge",
  dot: "release-notes-trigger-badge",
  status: "status-badge",
};

export function Badge({
  type = "digest",
  className = "",
  children,
  title,
  ariaLabel,
}: {
  type?: string;
  className?: string;
  children?: ComponentChildren;
  title?: string;
  ariaLabel?: string;
}) {
  const base = TYPE_CLASS[type] || type;
  return (
    <span
      class={`${base}${className ? ` ${className}` : ""}`}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
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
}: {
  status?: string;
  className?: string;
  children?: ComponentChildren;
}) {
  const mod = status ? ` ${status}` : "";
  return (
    <span class={`status-badge${mod}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
