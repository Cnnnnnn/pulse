/**
 * src/renderer/components/ConfirmDialog.jsx
 *
 * 全局 ConfirmDialog — 单例, 跟随 confirmStore signals 渲染.
 * 替代 window.confirm (Electron 浏览器原生 confirm 视觉不一致).
 *
 * v2.11.5 (2026-06-14) — 初版.
 */

import { useEffect, useRef } from "preact/hooks";
import { createPortal } from "preact/compat";
import { confirmDialog, confirmVisible, resolveConfirm } from "../confirmStore.js";

export function ConfirmDialog() {
  const visible = confirmVisible.value;
  const state = confirmDialog.value;
  const confirmBtnRef = useRef(null);
  const onKeyRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    confirmBtnRef.current && confirmBtnRef.current.focus();
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        resolveConfirm(false);
      } else if (e.key === "Enter") {
        // 默认不抢 Enter (用户在 input 里回车不应该触发 confirm)
        // 仅在焦点已经在确认按钮上时由浏览器自然触发
      }
    }
    onKeyRef.current = onKey;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible || !state) return null;

  const node = (
    <div
      class="modal-backdrop confirm-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) resolveConfirm(false);
      }}
    >
      <div
        class="modal-card confirm-dialog"
        role="alertdialog"
        aria-label={state.title}
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

export default ConfirmDialog;
