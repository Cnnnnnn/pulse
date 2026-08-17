/**
 * src/renderer/reminders/remindersStore.ts
 *
 * v2.11 提醒 (Reminders) — renderer signals + actions
 *
 * 沿用 src/renderer/funds/fundStore.ts 的 pattern (preact/signals + window.api).
 * 跟 reminders 主进程的字段一致 (id / title / triggerAt / repeat / weekday? / status / ...).
 */

import { signal, computed } from "@preact/signals";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
  type DataState,
} from "../../shared/data-state.ts";
import type { ReminderListResponse } from "../../shared/ipc-contracts.ts";
import { getApi, requireApiMethod } from "../store/store-utils.ts";
import { trackReminderUpdate } from "../recent/track.ts";

export const reminders = signal([]); // Reminder[]
export const remindersLoaded = signal(false);
export const remindersOpen = signal(false);
export const remindersDataState = signal<DataState<ReminderListResponse>>(
  createDataState({ ok: true, reminders: [] }),
);

export async function loadReminders() {
  const list = requireApiMethod("remindersList");
  if (!list) {
    remindersDataState.value = rejectData(remindersDataState.value, "ipc_unavailable");
    return false;
  }
  remindersDataState.value = beginDataRequest(remindersDataState.value);
  try {
    const r = await list();
    if (r && r.ok) {
      reminders.value = r.reminders || [];
      remindersLoaded.value = true;
      remindersDataState.value = resolveData(
        remindersDataState.value,
        r,
        { source: "live" },
      );
      return true;
    }
    remindersDataState.value = rejectData(
      remindersDataState.value,
      (r && (r.reason || r.msg)) || "load_failed",
    );
    return false;
  } catch (err) {
    remindersDataState.value = rejectData(remindersDataState.value, err);
    return false;
  }
}

export async function createReminder(input: any) {
  const create = requireApiMethod("remindersCreate");
  if (!create) return { ok: false, reason: "ipc_unavailable" };
  try {
    const r = await create(input);
    if (r && r.ok) {
      reminders.value = [...reminders.value, r.reminder];
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function updateReminder(id: any, patch: any) {
  const update = requireApiMethod("remindersUpdate");
  if (!update) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await update(id, patch);
    if (r && r.ok) {
      reminders.value = reminders.value.map((x: any) =>
        x.id === id ? r.reminder : x,
      );
      trackReminderUpdate(r.reminder);
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function removeReminder(id: any) {
  const remove = requireApiMethod("remindersRemove");
  if (!remove) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await remove(id);
    if (r && r.ok) {
      reminders.value = reminders.value.filter((x: any) => x.id !== id);
      return { ok: true };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function markReminderDone(id: any) {
  const markDone = requireApiMethod("remindersMarkDone");
  if (!markDone) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await markDone(id);
    if (r && r.ok) {
      if (r.reminder === null) {
        // once → 删
        reminders.value = reminders.value.filter((x: any) => x.id !== id);
      } else {
        reminders.value = reminders.value.map((x: any) =>
          x.id === id ? r.reminder : x,
        );
      }
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function markReminderDismissed(id: any) {
  const markDismissed = requireApiMethod("remindersMarkDismissed");
  if (!markDismissed) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await markDismissed(id);
    if (r && r.ok) {
      reminders.value = reminders.value.map((x: any) =>
        x.id === id ? r.reminder : x,
      );
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

/** Header 角标: fired (待打卡) 的数量 */
export const firedCount = computed(
  () => reminders.value.filter((r: any) => r && r.status === "fired").length,
);

/** 派发提醒: pending + fired (排除 dismissed) — 给时间线头部 "X 项" 用 */
export const activeCount = computed(
  () => reminders.value.filter((r: any) => r && r.status !== "dismissed").length,
);

/** 下一个 pending 提醒 (按 triggerAt 升序) */
export const nextDue = computed(() => {
  const pending = reminders.value
    .filter((r: any) => r && r.status === "pending")
    .slice()
    .sort((a: any, b: any) => a.triggerAt - b.triggerAt);
  return pending[0] || null;
});

// ── 跟 IPC 事件联动: reminders:fired / reminders:open-modal (主进程推) ──

let _installed = false;
let _cleanup: (() => void) | null = null;

/**
 * 装好 IPC 监听: 主进程推 reminders:fired → 合并到 reminders signal;
 * 推 reminders:open-modal → 自动弹 modal. 多次调用幂等.
 * 跟 installRecentListener() 同样的 pattern.
 */
export function installRemindersListener() {
  if (_installed) return _cleanup;
  const api = getApi();
  if (!api) return;

  const unsubscribes: Array<() => void> = [];

  if (typeof api.onRemindersFired === "function") {
    const unsubscribe = api.onRemindersFired(({ reminder }: any) => {
      if (!reminder || !reminder.id) return;
      const idx = reminders.value.findIndex((r: any) => r && r.id === reminder.id);
      if (idx >= 0) {
        const next = [...reminders.value];
        next[idx] = { ...next[idx], ...reminder };
        reminders.value = next;
      } else {
        reminders.value = [...reminders.value, reminder];
      }
    });
    if (typeof unsubscribe === "function") unsubscribes.push(unsubscribe);
  }

  if (typeof api.onRemindersOpenModal === "function") {
    const unsubscribe = api.onRemindersOpenModal(() => {
      remindersOpen.value = true;
    });
    if (typeof unsubscribe === "function") unsubscribes.push(unsubscribe);
  }

  _cleanup = () => {
    for (const unsubscribe of unsubscribes.splice(0).reverse()) unsubscribe();
    _cleanup = null;
    _installed = false;
  };
  _installed = true;
  return _cleanup;
}

/** 清理 IPC 监听，供页面/测试卸载时使用。重复调用安全。 */
export function cleanupRemindersListener() {
  _cleanup?.();
}

export function toggleRemindersOpen() {
  remindersOpen.value = !remindersOpen.value;
  if (remindersOpen.value && !remindersLoaded.value) {
    loadReminders();
  }
}
