/**
 * ModalShell — backdrop + card + header (title / ×) + body + footer.
 * Footer 按钮顺序: 次要在左, 主按钮在最右 (调用方按此顺序传入 actions).
 */
import { useEffect } from 'preact/hooks';

export function ModalShell({
  open,
  onClose,
  title,
  cardClass = '',
  backdropClass = 'modal-backdrop',
  ariaLabel,
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
    <div
      class={backdropClass}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class={`modal-card${cardClass ? ` ${cardClass}` : ''}`}
        role="dialog"
        aria-label={ariaLabel || title}
        onClick={(e) => e.stopPropagation()}
      >
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
        <div class="modal-body">{children}</div>
        {footer ? <div class="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
