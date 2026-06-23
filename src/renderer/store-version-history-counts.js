/**
 * src/renderer/store-version-history-counts.js
 *
 * 2026-06-14: App rollback · renderer-side cached per-app history counts.
 *
 * 目的: AppRow 的 ⏪ 按钮只对 "有备份可回滚" 的 app 显示 + 角标显示 count.
 * 不在每次 render 时拉整个 history, 只拉一份扁平 count 摘要.
 *
 * 流程:
 *   - bootstrap 时: main 一次性 snapshot versionHistoryCountsInit 注入到 store (key 'version-history-counts-init'),
 *     renderer 立即拿到初值
 *   - main 在 recordUpgrade / deleteEntry / doRollback 后 broadcast
 *     'version-history-counts-updated' { counts: {appName: number}, totalSizeBytes }
 *   - store 接收广播 → signal 更新 → AppRow 订阅 value 自动 re-render
 *
 * 跟 version-history store 完全解耦:
 *   - 这份只关心 "每个 app 有多少个可回滚版本"
 *   - drawer 才拉详细 entries
 */
import { signal } from "@preact/signals";

export const versionHistoryCounts = signal(new Map()); // Map<appName, number>
export const versionHistoryTotalSizeBytes = signal(0);
export const versionHistoryCountsLoaded = signal(false);

/**
 * Replace the whole map (initial load or full refresh).
 * @param {Object<string, number>} counts
 * @param {number} [totalSizeBytes]
 */
export function setVersionHistoryCounts(counts, totalSizeBytes) {
  if (counts && typeof counts === "object") {
    versionHistoryCounts.value = new Map(Object.entries(counts));
  }
  if (typeof totalSizeBytes === "number") {
    versionHistoryTotalSizeBytes.value = totalSizeBytes;
  }
  versionHistoryCountsLoaded.value = true;
}

/** Mutate one app's count (called by listener). */
export function bumpVersionHistoryCount(appName, count) {
  if (!appName) return;
  const next = new Map(versionHistoryCounts.value);
  if (typeof count === "number" && count > 0) {
    next.set(appName, count);
  } else {
    next.delete(appName);
  }
  versionHistoryCounts.value = next;
}

/** Subscribe to main broadcast (idempotent — only mounts one listener). */
let _listenerInstalled = false;
export function installVersionHistoryCountsListener() {
  if (_listenerInstalled) return;
  if (typeof window === "undefined" || !window.api) return;
  const api = window.api;
  if (typeof api.onVersionHistoryCountsUpdated !== "function") return;
  _listenerInstalled = true;
  api.onVersionHistoryCountsUpdated((payload) => {
    if (payload && payload.counts) {
      setVersionHistoryCounts(payload.counts, payload.totalSizeBytes);
    }
  });
}

/** Test-only: reset all module state. */
export function _resetForTest() {
  versionHistoryCounts.value = new Map();
  versionHistoryTotalSizeBytes.value = 0;
  versionHistoryCountsLoaded.value = false;
  _listenerInstalled = false;
}