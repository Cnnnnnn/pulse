/**
 * src/renderer/reminders/remindersStore.js
 *
 * v2.11 提醒 (Reminders) — renderer signals + actions
 *
 * 沿用 src/renderer/worldcup/betsStore.js 的 pattern (preact/signals + window.api).
 * 跟 reminders 主进程的字段一致 (id / title / triggerAt / repeat / weekday? / status / ...).
 */

import { signal, computed } from "@preact/signals";
import { requireApiMethod, wrapIpc } from "../store-utils.js";

export const reminders = signal([]); // Reminder[]
export const remindersLoaded = signal(false);
export const remindersOpen = signal(false);

export async function loadReminders() {
  const list = requireApiMethod("remindersList");
  if (!list) return false;
  return wrapIpc(
    async () => {
      const r = await list();
      if (r && r.ok) {
        reminders.value = r.reminders || [];
        remindersLoaded.value = true;
        return true;
      }
      return false;
    },
    { label: "[remindersStore] loadReminders failed", fallback: false },
  );
}

export async function createReminder(input) {
  const create = requireApiMethod("remindersCreate");
  if (!create) return { ok: false, reason: "ipc_unavailable" };
  try {
    const r = await create(input);
    if (r && r.ok) {
      reminders.value = [...reminders.value, r.reminder];
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function updateReminder(id, patch) {
  const update = requireApiMethod("remindersUpdate");
  if (!update) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await update(id, patch);
    if (r && r.ok) {
      reminders.value = reminders.value.map((x) =>
        x.id === id ? r.reminder : x,
      );
      import("../recent/track.js").then((m) =>
        m.trackReminderUpdate(r.reminder),
      );
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function removeReminder(id) {
  const remove = requireApiMethod("remindersRemove");
  if (!remove) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await remove(id);
    if (r && r.ok) {
      reminders.value = reminders.value.filter((x) => x.id !== id);
      return { ok: true };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function markReminderDone(id) {
  const markDone = requireApiMethod("remindersMarkDone");
  if (!markDone) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await markDone(id);
    if (r && r.ok) {
      if (r.reminder === null) {
        // once → 删
        reminders.value = reminders.value.filter((x) => x.id !== id);
      } else {
        reminders.value = reminders.value.map((x) =>
          x.id === id ? r.reminder : x,
        );
      }
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function markReminderDismissed(id) {
  const markDismissed = requireApiMethod("remindersMarkDismissed");
  if (!markDismissed) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await markDismissed(id);
    if (r && r.ok) {
      reminders.value = reminders.value.map((x) =>
        x.id === id ? r.reminder : x,
      );
      return { ok: true, reminder: r.reminder };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

/** Header 角标: fired (待打卡) 的数量 */
export const firedCount = computed(
  () => reminders.value.filter((r) => r && r.status === "fired").length,
);

/** 派发提醒: pending + fired (排除 dismissed) — 给时间线头部 "X 项" 用 */
export const activeCount = computed(
  () => reminders.value.filter((r) => r && r.status !== "dismissed").length,
);

/** 下一个 pending 提醒 (按 triggerAt 升序) */
export const nextDue = computed(() => {
  const pending = reminders.value
    .filter((r) => r && r.status === "pending")
    .slice()
    .sort((a, b) => a.triggerAt - b.triggerAt);
  return pending[0] || null;
});

// ── 跟 IPC 事件联动: reminders:fired (主进程推) ──────────────
//
// 主进程触发新 reminder 时会推 ipcRenderer 'reminders:fired',
// preload 那边暴露 onRemindersFired (TODO). 这里先用一个 in-app listener 兜底
// (loadReminders 重新拉一次). 后端 D5 时把 IPC channel 加上.

export function toggleRemindersOpen() {
  remindersOpen.value = !remindersOpen.value;
  if (remindersOpen.value && !remindersLoaded.value) {
    loadReminders();
  }
}
