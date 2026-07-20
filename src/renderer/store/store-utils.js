/**
 * src/renderer/store-utils.js
 *
 * 子 store (bets / reminders / recent / ithome) 共用的 window.api 访问层.
 * 主 store 走 src/renderer/api.js; 这些 feature store 直接绑 preload API.
 */

import { log as rendererLog } from "../log.js";

export function getApi() {
  if (typeof window === "undefined" || !window.api) return null;
  return window.api;
}

/** @param {string} methodName */
export function requireApiMethod(methodName) {
  const api = getApi();
  if (!api || typeof api[methodName] !== "function") return null;
  return api[methodName].bind(api);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ label?: string, fallback?: T }} [opts]
 * @returns {Promise<T>}
 */
export async function wrapIpc(fn, opts = {}) {
  const { label = "[ipc] call failed", fallback = false } = opts;
  try {
    return await fn();
  } catch (err) {
    rendererLog.warn(label, err);
    return fallback;
  }
}
