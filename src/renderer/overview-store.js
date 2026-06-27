/**
 * src/renderer/overview-store.js
 *
 * Overview 页 5 个数据源的 signal. 每个独立 setter,
 * 避免一处刷新影响其他 (per-section signal pattern).
 */
import { signal } from "@preact/signals";

export const kpis = signal({ upgradable: 0, latest: 0, error: 0, total: 0 });
export const trend = signal([]);
export const watchlistQuick = signal([]);
export const recentActivity = signal([]);
export const aiInsights = signal({ status: "idle", text: "", fromCache: false });

export function setKpis(v) {
  kpis.value = v;
}
export function setTrend(v) {
  trend.value = v;
}
export function setWatchlistQuick(v) {
  watchlistQuick.value = v;
}
export function setRecentActivity(v) {
  recentActivity.value = v;
}
export function setAiInsights(v) {
  aiInsights.value = v;
}

export function resetOverview() {
  kpis.value = { upgradable: 0, latest: 0, error: 0, total: 0 };
  trend.value = [];
  watchlistQuick.value = [];
  recentActivity.value = [];
  aiInsights.value = { status: "idle", text: "", fromCache: false };
}