/**
 * src/renderer/components/PageHeader.jsx
 *
 * 各 view 的 page-level header. 不含全局 TopBar (logo/搜索/通知),
 * 只显示 view 自己的标题 + subtitle + children (操作按钮).
 */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div class="page-header">
      <div class="page-header-text">
        <h2 class="page-header-title">{title}</h2>
        {subtitle && <p class="page-header-subtitle">{subtitle}</p>}
      </div>
      {children && <div class="page-header-actions">{children}</div>}
    </div>
  );
}

export default PageHeader;