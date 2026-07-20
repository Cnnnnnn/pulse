/**
 * src/renderer/confirmStore.js
 *
 * 全局 ConfirmDialog — signals + 阻塞 helper (Promise).
 *
 * 替代 window.confirm (在 Electron 里走浏览器原生 confirm, 视觉不一致).
 *
 * v2.11.5 (2026-06-14) — 初版.
 */

import { signal } from "@preact/signals";

/** @type {import("@preact/signals").Signal<null | { title?: string, message: string, confirmText: string, cancelText: string }>} */
export const confirmDialog = signal(null);

/** @type {import("@preact/signals").Signal<boolean>} */
export const confirmVisible = signal(false);

let _resolver = null;

/**
 * 弹一个 confirm 弹窗, 返回 Promise<boolean>.
 *
 * 重复调用会取消前一个 (前一个 resolve false). 当前不支持队列, 因为
 * 用户连续删除/清空通常是 UI 行为, 不会真的并发弹多个 (单线程 JS 串行).
 *
 * @param {{ title?: string, message: string, confirmText?: string, cancelText?: string }} opts
 * @returns {Promise<boolean>}
 */
export function openConfirm(opts = {}) {
  if (_resolver) {
    // 覆盖前一个 → 前一个 false
    const prev = _resolver;
    _resolver = null;
    prev(false);
  }
  const state = {
    title: opts.title || "请确认",
    message: opts.message || "",
    confirmText: opts.confirmText || "确认",
    cancelText: opts.cancelText || "取消",
  };
  confirmDialog.value = state;
  confirmVisible.value = true;
  return new Promise((resolve) => {
    _resolver = resolve;
  });
}

/**
 * 关闭弹窗并 resolve 当前 promise.
 * @param {boolean} ok
 */
export function resolveConfirm(ok) {
  const r = _resolver;
  _resolver = null;
  confirmVisible.value = false;
  confirmDialog.value = null;
  if (r) r(Boolean(ok));
}

/** 测试用: 重置内部 state */
export function _resetConfirm() {
  _resolver = null;
  confirmVisible.value = false;
  confirmDialog.value = null;
}
