/**
 * DrawerShell — overlay + fixed aside + header (title / ×) + body (+ optional slots).
 * ponytail: 只封装 ESC / 遮罩点击 / 关闭按钮; 各 drawer 保留自己的 BEM class 以复用现有 CSS.
 */
import { useEffect } from 'preact/hooks';

export function DrawerShell({
  open,
  onClose,
  title,
  titleExtra = null,
  overlayClass,
  drawerClass,
  showOverlay = true,
  role = 'complementary',
  ariaLabel,
  beforeBody = null,
  footer = null,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {showOverlay ? (
        <div
          class={`${overlayClass} visible`}
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <aside class={drawerClass} role={role} aria-label={ariaLabel}>
        <header class={`${drawerClass}__header`}>
          <span class={`${drawerClass}__title`}>{title}</span>
          {titleExtra}
          <button
            type="button"
            class={`${drawerClass}__close`}
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        {beforeBody}
        <div class={`${drawerClass}__body`}>{children}</div>
        {footer}
      </aside>
    </>
  );
}
