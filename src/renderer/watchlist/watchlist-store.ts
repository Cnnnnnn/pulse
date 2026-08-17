/**
 * src/renderer/watchlist/watchlist-store.ts
 *
 * I2 v1: app pin
 * I2 v2: + fund / keyword
 * Phase 33: 抽屉 → 弹窗 (跟 Reminders 形态一致). 保留 watchlistDrawerOpen 兼容旧调用.
 */
import { signal, computed } from "@preact/signals";
import { api } from "../api.ts";
import type { WatchlistItem } from "../../shared/ipc-contracts";

export const watchlistItems = signal<WatchlistItem[]>([]);
export const watchlistDrawerOpen = signal(false);
export const watchlistModalOpen = signal(false);

export function isAppPinned(appName: any) {
  return watchlistItems.value.some(
    (w: any) => w.type === "app" && w.ref === appName,
  );
}

export function isFundPinned(code: any) {
  return watchlistItems.value.some((w: any) => w.type === "fund" && w.ref === code);
}

export function isMetalPinned(id: any) {
  return watchlistItems.value.some((w: any) => w.type === "metal" && w.ref === id);
}

export const isPinned = (appName: any) => computed(() => isAppPinned(appName));

export function itemKey(w: any) {
  if (!w) return "";
  return `${w.type || "app"}:${w.ref || w.appName || ""}`;
}

export async function refreshWatchlist() {
  const r = await api.watchlistList();
  if (r && r.ok) watchlistItems.value = r.items;
}

export function openWatchlistDrawer(open: any = 0) {
  watchlistDrawerOpen.value = Boolean(open);
}
export function toggleWatchlistDrawer() {
  watchlistDrawerOpen.value = !watchlistDrawerOpen.value;
}

// Phase 33: modal 入口
export function openWatchlistModal(open: any = 0) {
  watchlistModalOpen.value = Boolean(open);
}
export function toggleWatchlistModal() {
  watchlistModalOpen.value = !watchlistModalOpen.value;
}

export async function addWatchlistItem({ type, ref }: any) {
  if (!type || !ref) return;
  const r = await api.watchlistAdd({ type, ref });
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function addWatchlist(appName: any) {
  return addWatchlistItem({ type: "app", ref: appName });
}

export async function removeWatchlistItem({ type, ref }: any) {
  if (!type || !ref) return;
  const r = await api.watchlistRemove({ type, ref });
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function removeWatchlist(appName: any) {
  return removeWatchlistItem({ type: "app", ref: appName });
}
