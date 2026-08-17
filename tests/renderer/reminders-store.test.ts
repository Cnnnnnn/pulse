/**
 * tests/renderer/reminders-store.test.js
 *
 * 覆盖 remindersStore 的 IPC 事件订阅：
 * - installRemindersListener(): onRemindersFired → reminders signal 刷新
 *   (按 id 合并, 新 id 追加)
 * - onRemindersOpenModal: 弹 modal (remindersOpen=true)
 * - install 多次幂等 (不重复订阅)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { apiState, emitFired, emitOpenModal } = vi.hoisted(() => {
  const apiState = {
    firedHandlers: [],
    openModalHandlers: [],
  };
  const emitFired = (data) => {
    for (const cb of apiState.firedHandlers) cb(data);
  };
  const emitOpenModal = (data) => {
    for (const cb of apiState.openModalHandlers) cb(data);
  };
  return { apiState, emitFired, emitOpenModal };
});

vi.mock("../../src/renderer/store/store-utils.ts", () => ({
  getApi: () => ({
    onRemindersFired: (cb) => {
      apiState.firedHandlers.push(cb);
      return () => {
        const i = apiState.firedHandlers.indexOf(cb);
        if (i >= 0) apiState.firedHandlers.splice(i, 1);
      };
    },
    onRemindersOpenModal: (cb) => {
      apiState.openModalHandlers.push(cb);
      return () => {
        const i = apiState.openModalHandlers.indexOf(cb);
        if (i >= 0) apiState.openModalHandlers.splice(i, 1);
      };
    },
  }),
  requireApiMethod: (name) => {
    if (name === "onRemindersFired") {
      return (cb) => {
        apiState.firedHandlers.push(cb);
        return () => {
          const i = apiState.firedHandlers.indexOf(cb);
          if (i >= 0) apiState.firedHandlers.splice(i, 1);
        };
      };
    }
    if (name === "onRemindersOpenModal") {
      return (cb) => {
        apiState.openModalHandlers.push(cb);
        return () => {
          const i = apiState.openModalHandlers.indexOf(cb);
          if (i >= 0) apiState.openModalHandlers.splice(i, 1);
        };
      };
    }
    return () => {};
  },
  wrapIpc: (fn) => fn,
}));

let reminders;
let remindersOpen;
let remindersDataState;
let installRemindersListener;
let cleanupRemindersListener;
let loadReminders;

async function loadStore() {
  vi.resetModules();
  const m = await import("../../src/renderer/reminders/remindersStore.ts");
  reminders = m.reminders;
  remindersOpen = m.remindersOpen;
  remindersDataState = m.remindersDataState;
  installRemindersListener = m.installRemindersListener;
  cleanupRemindersListener = m.cleanupRemindersListener;
  loadReminders = m.loadReminders;
}

const NOW = Date.now();

describe("remindersStore installRemindersListener", () => {
  beforeEach(async () => {
    apiState.firedHandlers.length = 0;
    apiState.openModalHandlers.length = 0;
    await loadStore();
    reminders.value = [];
    remindersOpen.value = false;
    remindersDataState.value = {
      phase: "idle",
      data: { ok: true, reminders: [] },
      error: null,
      source: "unknown",
      fetchedAt: 0,
      lastAttemptAt: 0,
    };
  });

  it("loadReminders 请求失败时进入 error 状态", async () => {
    await expect(loadReminders()).resolves.toBe(false);
    expect(remindersDataState.value.phase).toBe("error");
    expect(remindersDataState.value.error).toBe("load_failed");
  });

  it("onRemindersFired 回调: 按 id 替换已存在的 reminder", () => {
    reminders.value = [
      { id: "r1", title: "old", status: "pending", triggerAt: NOW - 1000 },
    ];
    installRemindersListener();
    emitFired({
      id: "r1",
      reminder: {
        id: "r1",
        title: "old",
        status: "fired",
        triggerAt: NOW,
        firedAt: NOW,
      },
    });
    expect(reminders.value[0].status).toBe("fired");
    expect(reminders.value[0].firedAt).toBe(NOW);
    expect(reminders.value.length).toBe(1);
  });

  it("onRemindersFired 收到新 id: 追加到列表", async () => {
    // 先 load 一个干净 module, 用 installRemindersListener 走完订阅
    installRemindersListener();
    emitFired({
      id: "r99",
      reminder: { id: "r99", title: "new", status: "fired", triggerAt: NOW },
    });
    expect(reminders.value.length).toBe(1);
    expect(reminders.value[0].id).toBe("r99");
    expect(reminders.value[0].status).toBe("fired");
  });

  it("onRemindersOpenModal 回调: 弹 modal (remindersOpen=true)", () => {
    expect(remindersOpen.value).toBe(false);
    installRemindersListener();
    emitOpenModal({ id: "r1" });
    expect(remindersOpen.value).toBe(true);
  });

  it("install 多次调用安全 (idempotent, 不重复订阅)", () => {
    installRemindersListener();
    installRemindersListener();
    installRemindersListener();
    expect(apiState.firedHandlers.length).toBe(1);
    expect(apiState.openModalHandlers.length).toBe(1);
  });

  it("cleanupRemindersListener 会移除两类 IPC 监听并允许重新安装", () => {
    installRemindersListener();
    expect(apiState.firedHandlers.length).toBe(1);
    expect(apiState.openModalHandlers.length).toBe(1);

    cleanupRemindersListener();
    expect(apiState.firedHandlers.length).toBe(0);
    expect(apiState.openModalHandlers.length).toBe(0);

    installRemindersListener();
    expect(apiState.firedHandlers.length).toBe(1);
    expect(apiState.openModalHandlers.length).toBe(1);
  });
});
