/**
 * src/renderer/wechat-hot/store.js
 *
 * Renderer-side signals + bootstrap + 15s 冷却.
 * Mirror src/renderer/ithome/store.js 风格.
 */

import { signal, computed } from "@preact/signals";
import { api } from "../api.js";

const COOLDOWN_MS = 15000;

export const wechatHotItems = signal([]);
export const wechatHotLoaded = signal(false);
export const wechatHotLoading = signal(false);
export const wechatHotError = signal(null);
export const wechatHotLastFetched = signal(0);
export const wechatHotLastRefreshAt = signal(0);
export const wechatHotUpdatedUnsub = signal(null);
export const wechatHotReadIds = signal({});
export const wechatHotNewIds = signal({});
/**
 * SideNav 未读角标 (I6 v2) — 本 session 新增且未读的热搜词数.
 * 派生自 wechatHotNewIds: 点行 (markWechatHotRead) → -1; refresh 新词 → +N; 重启 → 归 0.
 */
export const wechatHotUnreadBadge = computed(
  () => Object.keys(wechatHotNewIds.value).length
);

export function applyPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  wechatHotItems.value = Array.isArray(payload.items) ? payload.items : [];
  wechatHotLastFetched.value = payload.fetchedAt || 0;
  wechatHotLoaded.value = true;
  wechatHotError.value = null;
  // I6 v2: diff 产生 newIds — 本 session 首次出现且未读的词
  const prevIds = new Set(Object.keys(wechatHotNewIds.value));
  const newMap = { ...wechatHotNewIds.value };
  let mutated = false;
  for (const it of wechatHotItems.value) {
    const title = it && it.title;
    if (title && !prevIds.has(title) && !wechatHotReadIds.value[title]) {
      newMap[title] = 1;
      mutated = true;
    }
  }
  if (mutated) wechatHotNewIds.value = newMap;
}

export async function bootstrapWechatHotTab() {
  try {
    // I6 v2: 先拉已读词, 再 load (diff 依赖 readIds)
    wechatHotReadIds.value = await api.wechatHotLoadRead();
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
    try {
      wechatHotUpdatedUnsub.value();
    } catch {
      /* noop */
    }
    wechatHotUpdatedUnsub.value = null;
  }
}

export async function markWechatHotRead(title) {
  if (!title || typeof title !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const now = Date.now();
  wechatHotReadIds.value = { ...wechatHotReadIds.value, [title]: now };
  if (wechatHotNewIds.value[title]) {
    const next = { ...wechatHotNewIds.value };
    delete next[title];
    wechatHotNewIds.value = next;
  }
  try {
    await api.wechatHotMarkRead(title);
  } catch {
    /* signal is source of truth */
  }
  return { ok: true };
}

/**
 * I6 v2: 用户首次切到 wechat-hot tab 时清零未读角标.
 * 行为对标 clearFundNavBadge / clearAiUsageNavBadge (src/renderer/worldcup/navStore.js setActiveNav).
 * 跟 ithome 的"view mode 切换时清"区别: wechat-hot 没有 view mode, 所以"切到 tab"即代表"看过".
 * ponytail: 不动 wechatHotReadIds (持久化已读词), 只清 session 级 newIds.
 * 重启后 newIds 本来就归 0, 行为可观察.
 */
export function clearWechatHotUnreadBadge() {
  if (Object.keys(wechatHotNewIds.value).length === 0) return;
  wechatHotNewIds.value = {};
}

const REASON_MAP = {
  fetch_failed: "拉取失败，请检查网络连接后重试",
  parse_failed: "微博热搜页面解析失败，可能是源结构变化，请稍后重试",
  http_timeout: "网络连接超时，请重试",
  threw: "拉取异常",
  ipc_unavailable: "系统通信异常，请重启应用",
};
function mapReason(reason) {
  return REASON_MAP[reason] || reason || "刷新失败";
}
