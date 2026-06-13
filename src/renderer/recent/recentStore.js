/**
 * src/renderer/recent/recentStore.js
 *
 * v2.11 时间线 (Recent Activity) — renderer signals + actions
 *
 * 模式跟 remindersStore.js 完全一致. 推 + 列都走 IPC, 主进程负责折叠去重.
 */

import { signal } from "@preact/signals";

export const recent = signal([]); // RecentActivityEntry[]
export const recentLoaded = signal(false);
export const recentOpen = signal(false);
export const recentFilter = signal("all"); // 'all' | kind

function _api() {
  if (typeof window === "undefined" || !window.api) return null;
  return window.api;
}

export async function loadRecent() {
  const a = _api();
  if (!a || typeof a.recentList !== "function") return false;
  try {
    const r = await a.recentList();
    if (r && r.ok) {
      recent.value = r.entries || [];
      recentLoaded.value = true;
      return true;
    }
    return false;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[recentStore] loadRecent failed", err);
    }
    return false;
  }
}

/**
 * 推一条 entry. 5min 内同 kind+ref 自动折叠 (主进程做).
 * 失败也不抛 — 时间线是辅助功能, 不冲淡主流程.
 */
export async function pushRecent(entry) {
  const a = _api();
  if (!a || typeof a.recentPush !== "function") return false;
  try {
    const r = await a.recentPush(entry);
    return !!(r && r.ok);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[recentStore] pushRecent failed", err);
    }
    return false;
  }
}

export function toggleRecentOpen() {
  recentOpen.value = !recentOpen.value;
  if (recentOpen.value && !recentLoaded.value) {
    loadRecent();
  }
}

/** 装好 IPC 监听: 收到 'recent:updated' 即时刷本地 signal */
export function installRecentListener() {
  if (typeof window === "undefined") return;
  const a = window.api;
  if (!a || typeof a.onRecentUpdated !== "function") return;
  a.onRecentUpdated(({ entries }) => {
    if (Array.isArray(entries)) {
      recent.value = entries;
      recentLoaded.value = true;
    }
  });
}
