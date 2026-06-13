/**
 * src/renderer/store/toast-store.js
 *
 * Toast notification queue — Toast.jsx 订阅 .value 渲染.
 */

import { signal } from "@preact/signals";

export const toast = signal([]);

let _toastIdCounter = 0;
function _nextToastId() {
  _toastIdCounter += 1;
  return `toast-${Date.now()}-${_toastIdCounter}`;
}

export function showToast(message, type = "info", ms = 5000) {
  if (typeof message !== "string" || message.length === 0) return null;
  const id = _nextToastId();
  const t = { id, message, type, ts: Date.now() };
  toast.value = [...toast.value, t];
  if (ms > 0) setTimeout(() => dismissToast(id), ms);
  return id;
}

export function dismissToast(id) {
  toast.value = toast.value.filter((t) => t.id !== id);
}

export function clearToasts() {
  toast.value = [];
}
