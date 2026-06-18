/**
 * src/renderer/wechat-hot/store.js
 *
 * Renderer-side signals + bootstrap + 15s 冷却.
 * Mirror src/renderer/ithome/store.js 风格.
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";

const COOLDOWN_MS = 15000;

export const wechatHotItems = signal([]);
export const wechatHotLoaded = signal(false);
export const wechatHotLoading = signal(false);
export const wechatHotError = signal(null);
export const wechatHotLastFetched = signal(0);
export const wechatHotLastRefreshAt = signal(0);
export const wechatHotUpdatedUnsub = signal(null);

export function applyPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  wechatHotItems.value = Array.isArray(payload.items) ? payload.items : [];
  wechatHotLastFetched.value = payload.fetchedAt || 0;
  wechatHotLoaded.value = true;
  wechatHotError.value = null;
}

export async function bootstrapWechatHotTab() {
  try {
    const cached = await api.wechatHotLoad();
    applyPayload(cached);
    if (!cached || !Array.isArray(cached.items) || cached.items.length === 0) {
      await refreshWechatHot();
    }
  } catch {
    /* keep signals at initial, surface error via refresh attempt */
    await refreshWechatHot();
  }
}

export async function refreshWechatHot() {
  if (wechatHotLoading.value) return false;
  const now = Date.now();
  if (now - wechatHotLastRefreshAt.value < COOLDOWN_MS) return false;
  wechatHotLastRefreshAt.value = now;
  wechatHotLoading.value = true;
  wechatHotError.value = null;
  try {
    const r = await api.wechatHotRefresh();
    if (r && r.ok === false) {
      wechatHotError.value = mapReason(r.reason);
      return false;
    }
    applyPayload(r);
    return true;
  } catch (err) {
    wechatHotError.value = (err && err.message) || "刷新失败";
    return false;
  } finally {
    wechatHotLoading.value = false;
  }
}

export function subscribeWechatHotUpdates() {
  if (wechatHotUpdatedUnsub.value) return; // 幂等
  const unsub = api.onWechatHotUpdated((payload) => {
    applyPayload(payload);
  });
  wechatHotUpdatedUnsub.value = typeof unsub === "function" ? unsub : null;
}

export function cleanupWechatHotUpdates() {
  if (wechatHotUpdatedUnsub.value) {
    try { wechatHotUpdatedUnsub.value(); } catch { /* noop */ }
    wechatHotUpdatedUnsub.value = null;
  }
}

const REASON_MAP = {
  fetch_failed: "拉取失败，请检查网络连接后重试",
  parse_failed: "热搜页面解析失败，可能是源结构变化，请稍后重试",
  http_timeout: "网络连接超时，请重试",
  threw: "拉取异常",
  ipc_unavailable: "系统通信异常，请重启应用",
};
function mapReason(reason) {
  return REASON_MAP[reason] || reason || "刷新失败";
}