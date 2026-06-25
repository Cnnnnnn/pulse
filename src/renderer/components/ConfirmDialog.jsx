/**
 * src/renderer/components/ConfirmDialog.jsx
 *
 * 全局 ConfirmDialog — 单例, 跟随 confirmStore signals 渲染.
 */

import { useEffect, useRef } from "preact/hooks";
import { confirmDialog, confirmVisible, resolveConfirm } from "../confirmStore.js";
import { ModalShell } from "./ModalShell.jsx";

export function ConfirmDialog() {
  const visible = confirmVisible.value;
  const state = confirmDialog.value;
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    confirmBtnRef.current && confirmBtnRef.current.focus();
  }, [visible]);

  if (!visible || !state) return null;

  return (
    <ModalShell
      open={visible}
      onClose={() => resolveConfirm(false)}
      backdropClass="modal-backdrop confirm-dialog-backdrop"
      cardClass="confirm-dialog"
      role="alertdialog"
      layout="bare"
      usePortal
      ariaLabel={state.title}
    >
      <h3 class="confirm-dialog-title">{state.title}</h3>
      <div class="confirm-dialog-message">{state.message}</div>
      <div class="confirm-dialog-actions">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onClick={() => resolveConfirm(false)}
        >
          {state.cancelText}
        </button>
        <button
          ref={confirmBtnRef}
          type="button"
          class="btn btn-primary btn-sm"
          onClick={() => resolveConfirm(true)}
        >
          {state.confirmText}
        </button>
      </div>
    </ModalShell>
  );
}

export default ConfirmDialog;
