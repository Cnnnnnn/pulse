/**
 * src/renderer/watchlist/watchlist-store.js
 *
 * 2026-06-23: Phase I2 v1 — Preact signals for the watchlist drawer
 * and ⭐ pin button on each app row.
 *
 * 镜像 diagnostics-store 的设计: signal 状态 + 4 个 mutator 函数
 * (refresh / add / remove) + 1 个 computed (isPinned).
 */
import { signal, computed } from "@preact/signals";
import { api } from "../api.js";

export const watchlistItems = signal([]);            // [{appName, addedAt, lastNotifiedVersion}]
export const watchlistDrawerOpen = signal(false);

export const isPinned = (appName) =>
  computed(() => watchlistItems.value.some((w) => w.appName === appName));

export async function refreshWatchlist() {
  const r = await api.watchlistList();
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function addWatchlist(appName) {
  if (!appName) return;
  const r = await api.watchlistAdd(appName);
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function removeWatchlist(appName) {
  if (!appName) return;
  const r = await api.watchlistRemove(appName);
  if (r && r.ok) watchlistItems.value = r.items;
}