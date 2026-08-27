/**
 * src/renderer/concerts/store.ts
 *
 * 渲染端 signals + bootstrap + 30s 冷却 + 快照差分（涨跌高亮用）.
 * Mirror src/renderer/movies/store.ts 风格.
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
} from "../../shared/data-state.ts";
import type { DataState } from "../../shared/data-state.ts";
import {
  CONCERTS_CACHE_TTL_MS,
  CONCERTS_REFRESH_COOLDOWN_MS,
} from "../../shared/concerts-constants.ts";

export const concertsWatches = signal<any[]>([]);
export const concertsSnapshots = signal<Record<string, any>>({});
/** 上一轮快照（涨跌高亮基准；refresh 成功后旧值移到这里） */
export const concertsPrevSnapshots = signal<Record<string, any>>({});
export const concertsLoaded = signal(false);
export const concertsLoading = signal(false);
export const concertsError = signal<string | null>(null);
export const concertsLastFetched = signal(0);
export const concertsLastRefreshAt = signal(0);
export const concertsUpdatedUnsub = signal<null | (() => void)>(null);
export const concertsAddBusy = signal(false);
export const concertsAddError = signal<string | null>(null);
export const concertsDataState = signal<DataState<any>>(
  createDataState({ watches: [], snapshots: {} }),
);

function payloadValid(p: any): boolean {
  return !!p && typeof p === "object" && Array.isArray(p.watches);
}

export function applyConcertsPayload(payload: any, source: "live" | "cache" = "live") {
  if (!payloadValid(payload)) return;
  // 涨跌高亮基准：仅在同一轮有上一份数据时记录
  if (concertsSnapshots.value && Object.keys(concertsSnapshots.value).length) {
    concertsPrevSnapshots.value = concertsSnapshots.value;
  }
  concertsWatches.value = payload.watches;
  concertsSnapshots.value =
    payload.snapshots && typeof payload.snapshots === "object" ? payload.snapshots : {};
  concertsLastFetched.value = payload.fetchedAt || 0;
  concertsLoaded.value = true;
  const degradedKeys = Object.values(concertsSnapshots.value)
    .filter((s: any) => s && s.error)
    .map((s: any) => s.key);
  concertsError.value = degradedKeys.length ? "部分场次刷新失败，显示上次数据" : null;
  concertsDataState.value = resolveData(concertsDataState.value, payload, {
    source,
    fetchedAt: payload.fetchedAt || undefined,
  });
}

export async function bootstrapConcertsTab() {
  try {
    const cached = await api.concertsLoad();
    applyConcertsPayload(cached, "cache");
    const stale =
      !cached || !cached.fetchedAt || Date.now() - cached.fetchedAt > CONCERTS_CACHE_TTL_MS;
    if (!cached || stale) await refreshConcerts();
  } catch {
    await refreshConcerts();
  }
}

export async function refreshConcerts(): Promise<boolean> {
  if (concertsLoading.value) return false;
  const now = Date.now();
  if (now - concertsLastRefreshAt.value < CONCERTS_REFRESH_COOLDOWN_MS) return false;
  concertsLastRefreshAt.value = now;
  concertsLoading.value = true;
  concertsDataState.value = beginDataRequest(concertsDataState.value);
  concertsError.value = null;
  try {
    const r = await api.concertsRefresh();
    applyConcertsPayload(r, "live");
    return true;
  } catch (err: any) {
    concertsError.value = (err && err.message) || "刷新失败";
    concertsDataState.value = rejectData(concertsDataState.value, concertsError.value);
    return false;
  } finally {
    concertsLoading.value = false;
  }
}

/** 粘贴 URL 添加监听。主进程会立即验证并返回首个快照 */
export async function addConcertWatch(url: string): Promise<boolean> {
  const clean = typeof url === "string" ? url.trim() : "";
  if (!clean) return false;
  if (concertsAddBusy.value) return false;
  concertsAddBusy.value = true;
  concertsAddError.value = null;
  try {
    const r = await api.concertsAdd({ url: clean });
    if (!r || !r.ok) {
      concertsAddError.value = ADD_REASON_MAP[(r && r.reason) || ""] || "添加失败，请检查链接";
      return false;
    }
    if (r.payload) applyConcertsPayload(r.payload, "live");
    else await refreshConcerts();
    return true;
  } catch (err: any) {
    concertsAddError.value = (err && err.message) || "添加失败";
    return false;
  } finally {
    concertsAddBusy.value = false;
  }
}

export async function removeConcertWatch(id: string): Promise<boolean> {
  try {
    const r = await api.concertsRemove(id);
    if (r && r.ok && r.payload) applyConcertsPayload(r.payload, "live");
    else if (r && r.ok) await refreshConcerts();
    return Boolean(r && r.ok);
  } catch {
    return false;
  }
}

/**
 * 差分当前 vs 上轮：per watch key → per session id 的价格变化。
 * 正数 = 最低价上涨，负数 = 下跌。无上一轮数据则无条目。
 */
export function computeSessionDeltas(
  current: Record<string, any>,
  prev: Record<string, any>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const key of Object.keys(current || {})) {
    const prevSnap = prev && prev[key];
    if (!prevSnap) continue;
    const prevPrices: Record<string, number> = {};
    for (const s of prevSnap.sessions || []) {
      if (s && s.id && s.minPrice != null) prevPrices[s.id] = Number(s.minPrice);
    }
    const deltas: Record<string, number> = {};
    for (const s of current[key].sessions || []) {
      if (!s || !s.id || s.minPrice == null) continue;
      const before = prevPrices[s.id];
      if (before == null) continue;
      const d = Number(s.minPrice) - before;
      if (d !== 0) deltas[s.id] = d;
    }
    if (Object.keys(deltas).length) out[key] = deltas;
  }
  return out;
}

/** 票档价差。qtyByWatch: watchKey → tierId → 张数；有则比该张数单价，否则比 lowPrice。 */
export function computeTierDeltas(
  current: Record<string, any>,
  prev: Record<string, any>,
  qtyByWatch?: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const key of Object.keys(current || {})) {
    const prevSnap = prev && prev[key];
    if (!prevSnap) continue;
    const qtyMap = (qtyByWatch && qtyByWatch[key]) || {};
    const prevPrices: Record<string, number> = {};
    for (const s of prevSnap.sessions || []) {
      for (const t of s.tiers || []) {
        if (!t || !t.id) continue;
        const p = tierUnitPrice(t, qtyMap[t.id] || 1);
        if (p != null) prevPrices[t.id] = Number(p);
      }
    }
    const deltas: Record<string, number> = {};
    for (const s of current[key].sessions || []) {
      for (const t of s.tiers || []) {
        if (!t || !t.id) continue;
        const p = tierUnitPrice(t, qtyMap[t.id] || 1);
        if (p == null) continue;
        const before = prevPrices[t.id];
        if (before == null) continue;
        const d = Number(p) - before;
        if (d !== 0) deltas[t.id] = d;
      }
    }
    if (Object.keys(deltas).length) out[key] = deltas;
  }
  return out;
}

/** 取指定张数单价；无 qtyPrices 匹配则回退 lowPrice */
export function tierUnitPrice(tier: any, qty = 1): string | undefined {
  const q = Number(qty) || 1;
  const list = tier && Array.isArray(tier.qtyPrices) ? tier.qtyPrices : [];
  const hit = list.find((p: any) => Number(p.qty) === q);
  if (hit && hit.salePrice != null) return String(hit.salePrice);
  return tier && tier.lowPrice != null ? String(tier.lowPrice) : undefined;
}

/** 从快照扁平化所有票档（钉选条用） */
export function flattenSnapshotTiers(snapshot: any): any[] {
  const out: any[] = [];
  for (const s of (snapshot && snapshot.sessions) || []) {
    for (const t of s.tiers || []) {
      if (t && t.id) out.push({ ...t, sessionId: s.id, sessionName: s.name });
    }
  }
  return out;
}

export async function setConcertWatchedTiers(
  watchId: string,
  tierIds: string[],
  tierQty?: Record<string, number>,
): Promise<boolean> {
  try {
    const r = await api.concertsSetWatchedTiers({ watchId, tierIds, tierQty });
    if (r && r.ok && r.payload && Array.isArray(r.payload.watches)) {
      // 只改 watches，别走 applyConcertsPayload（会把当前快照挪进 prev，冲掉涨跌基准）
      concertsWatches.value = r.payload.watches;
      return true;
    }
    return Boolean(r && r.ok);
  } catch {
    return false;
  }
}

export function formatConcertsFetchedAt(ts: number, now = Date.now()): string {
  if (!ts) return "";
  const sec = Math.floor((now - ts) / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export function subscribeConcertsUpdates() {
  if (concertsUpdatedUnsub.value) return; // 幂等
  const unsub = api.onConcertsUpdated((payload: any) => {
    applyConcertsPayload(payload, "live");
  });
  concertsUpdatedUnsub.value = typeof unsub === "function" ? unsub : null;
}

export function cleanupConcertsUpdates() {
  if (concertsUpdatedUnsub.value) {
    try {
      concertsUpdatedUnsub.value();
    } catch {
      /* noop */
    }
    concertsUpdatedUnsub.value = null;
  }
}

const ADD_REASON_MAP: Record<string, string> = {
  invalid_url: "无法识别的链接。票牛 activity/…；摩天轮国内需含 showId；摩天轮国际需 tourId+showId",
  fetch_failed: "该演出暂时拉取不到票价，可能已下架或网络异常",
  http_timeout: "网络连接超时，请重试",
  parse_failed: "页面结构解析失败，请稍后重试",
  invalid_args: "参数错误",
};
