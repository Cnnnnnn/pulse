/**
 * ModalShell — backdrop + card + header (title / ×) + body + footer.
 * Footer 按钮顺序: 次要在左, 主按钮在最右.
 */
import { useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';

/** 自定义 modal 顶栏 — 配合 ModalShell `header` 槽 */
export function ModalHeader({ className = 'modal-header', children }) {
  return <header class={className}>{children}</header>;
}

export function ModalShell({
  open,
  onClose,
  onBackdropClick,
  onEscape,
  onCardKeyDown,
  title,
  header = null,
  cardClass = '',
  useModalCardClass = true,
  backdropClass = 'modal-backdrop',
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  beforeBody = null,
  footer = null,
  bodyClass = 'modal-body',
  wrapBody = true,
  children,
  usePortal = false,
  layout = 'standard',
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

  const backdropClick = onBackdropClick || onClose;
  const cardCls = useModalCardClass
    ? `modal-card${cardClass ? ` ${cardClass}` : ''}`
    : (cardClass || 'modal-card');

  const bodyNode = wrapBody && children != null ? (
    <div class={bodyClass}>{children}</div>
  ) : children;

  const cardContent = layout === 'bare' ? children : (
    <>
      {header || (
        <div class="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            class="btn-close"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}
      {beforeBody}
      {bodyNode}
      {footer ? <div class="modal-footer">{footer}</div> : null}
    </>
  );

  const node = (
    <div
      class={backdropClass}
      onClick={(e) => {
        if (e.target === e.currentTarget) backdropClick();
      }}
    >
      <div
        class={cardCls}
        role={role}
        aria-label={ariaLabelledBy ? undefined : (ariaLabel || title)}
        aria-labelledby={ariaLabelledBy}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onCardKeyDown}
      >
        {cardContent}
      </div>
    </div>
  );

  if (usePortal) return createPortal(node, document.body);
  return node;
}

/** 领域 modal (fund / metal / wizard) — bare 布局 + 自定义 overlay/card class */
export function BareModalShell({
  overlayClass,
  cardClass,
  open,
  onClose,
  onEscape,
  onBackdropClick,
  onCardKeyDown,
  usePortal = false,
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  children,
}) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      onEscape={onEscape}
      onBackdropClick={onBackdropClick}
      onCardKeyDown={onCardKeyDown}
      layout="bare"
      backdropClass={overlayClass}
      cardClass={cardClass}
      useModalCardClass={false}
      usePortal={usePortal}
      role={role}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
    >
      {children}
    </ModalShell>
  );
}
