/**
 * src/renderer/watchlist/watchlist-store.js
 *
 * I2 v1: app pin
 * I2 v2: + fund / keyword
 */
import { signal, computed } from "@preact/signals";
import { api } from "../api.js";

export const watchlistItems = signal([]);
export const watchlistDrawerOpen = signal(false);

export function isAppPinned(appName) {
  return watchlistItems.value.some(
    (w) => w.type === "app" && w.ref === appName,
  );
}

export function isFundPinned(code) {
  return watchlistItems.value.some(
    (w) => w.type === "fund" && w.ref === code,
  );
}

export const isPinned = (appName) =>
  computed(() => isAppPinned(appName));

export function itemKey(w) {
  if (!w) return "";
  return `${w.type || "app"}:${w.ref || w.appName || ""}`;
}

export async function refreshWatchlist() {
  const r = await api.watchlistList();
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function addWatchlistItem({ type, ref }) {
  if (!type || !ref) return;
  const r = await api.watchlistAdd({ type, ref });
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function addWatchlist(appName) {
  return addWatchlistItem({ type: "app", ref: appName });
}

export async function removeWatchlistItem({ type, ref }) {
  if (!type || !ref) return;
  const r = await api.watchlistRemove({ type, ref });
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function removeWatchlist(appName) {
  return removeWatchlistItem({ type: "app", ref: appName });
}
