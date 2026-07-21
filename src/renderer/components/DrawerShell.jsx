/**
 * DrawerShell — overlay + fixed aside + header (title / ×) + body (+ optional slots).
 *
 * ponytail: usePortal=true 时 render 到 document.body 直接子节点, 跳出任何祖先
 *   stacking context (transform/filter/backdrop-filter 都会创建). 这是 z-index
 *   调多高都压不住的"穿透"的根本解法 — 跟 ModalShell 的 usePortal 保持一致.
 */
import { useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';

export function DrawerShell({
  open,
  onClose,
  onEscape,
  title,
  titleExtra = null,
  header = null,
  headerActions = null,
  overlayClass,
  drawerClass,
  drawerExtraClass = '',
  showOverlay = true,
  role = 'complementary',
  ariaLabel,
  beforeBody = null,
  footer = null,
  bodyClass,
  children,
  usePortal = false,
}) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        const esc = onEscapeRef.current;
        if (esc) {
          const block = esc(e);
          if (block === false) return;
        }
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const drawerCls = `${drawerClass}${drawerExtraClass ? ` ${drawerExtraClass}` : ''}`;
  const bodyCls = bodyClass || `${drawerClass}__body`;

  const node = (
    <>
      {showOverlay ? (
        <div
          class={`${overlayClass} visible`}
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <aside class={drawerCls} role={role} aria-label={ariaLabel || title}>
        {header || (
          <header class={`${drawerClass}__header`}>
            <span class={`${drawerClass}__title`}>{title}</span>
            {titleExtra}
            {headerActions}
            <button
              type="button"
              class={`${drawerClass}__close`}
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </header>
        )}
        {beforeBody}
        <div class={bodyCls}>{children}</div>
        {footer}
      </aside>
    </>
  );

  return usePortal ? createPortal(node, document.body) : node;
}