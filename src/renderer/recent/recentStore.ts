/**
 * src/renderer/recent/recentStore.ts
 *
 * v2.11 时间线 (Recent Activity) — renderer signals + actions
 *
 * 模式跟 remindersStore.js 完全一致. 推 + 列都走 IPC, 主进程负责折叠去重.
 */

import { signal } from "@preact/signals";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
  type DataState,
} from "../../shared/data-state.ts";
import type { RecentListResponse } from "../../shared/ipc-contracts.ts";
import { getApi, requireApiMethod, wrapIpc } from "../store/store-utils.ts";

export const recent = signal([]); // RecentActivityEntry[]
export const recentLoaded = signal(false);
export const recentOpen = signal(false);
export const recentFilter = signal("all"); // 'all' | kind
export const recentDataState = signal<DataState<RecentListResponse>>(
  createDataState({ ok: true, entries: [] }),
);

export async function loadRecent() {
  const list = requireApiMethod("recentList");
  if (!list) {
    recentDataState.value = rejectData(recentDataState.value, "ipc_unavailable");
    return false;
  }
  recentDataState.value = beginDataRequest(recentDataState.value);
  try {
    const r = await list();
    if (r && r.ok) {
      recent.value = r.entries || [];
      recentLoaded.value = true;
      recentDataState.value = resolveData(
        recentDataState.value,
        r,
        { source: "live" },
      );
      return true;
    }
    recentDataState.value = rejectData(
      recentDataState.value,
      (r && (r.reason || r.msg)) || "load_failed",
    );
    return false;
  } catch (err) {
    recentDataState.value = rejectData(recentDataState.value, err);
    return false;
  }
}

export async function pushRecent(entry: any) {
  const push = requireApiMethod("recentPush");
  if (!push) return false;
  return wrapIpc(
    async () => {
      const r = await push(entry);
      return !!(r && r.ok);
    },
    { label: "[recentStore] pushRecent failed", fallback: false },
  );
}

export function toggleRecentOpen() {
  recentOpen.value = !recentOpen.value;
  if (recentOpen.value && !recentLoaded.value) {
    loadRecent();
  }
}

/** 装好 IPC 监听: 收到 'recent:updated' 即时刷本地 signal */
export function installRecentListener() {
  const api = getApi();
  if (!api || typeof api.onRecentUpdated !== "function") return;
  api.onRecentUpdated(({ entries }: any) => {
    if (Array.isArray(entries)) {
      recent.value = entries;
      recentLoaded.value = true;
      recentDataState.value = resolveData(
        recentDataState.value,
        { ok: true, entries },
        { source: "live" },
      );
    }
  });
}
