/**
 * tests/renderer/confirm-store.test.js
 *
 * confirmStore 单测 — 全局 ConfirmDialog 的 store + 阻塞 helper.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { signal } from "@preact/signals";

const apiState = { handlers: {} };

vi.mock("../../src/renderer/api.js", () => ({
  __esModule: true,
  default: { get api() { return apiState; } },
}));

async function freshModule() {
  vi.resetModules();
  const m = await import("../../src/renderer/store/confirmStore.js");
  return m;
}

beforeEach(() => {
  apiState.handlers = {};
  vi.useRealTimers();
});

describe("confirmStore", () => {
  it("openConfirm shows dialog with title/message and returns promise", async () => {
    const { openConfirm, confirmDialog, confirmVisible, resolveConfirm } = await freshModule();
    const p = openConfirm({ title: "删除", message: "确认删除?" });
    expect(confirmVisible.value).toBe(true);
    expect(confirmDialog.value).toEqual({
      title: "删除",
      message: "确认删除?",
      confirmText: "确认",
      cancelText: "取消",
    });
    expect(typeof p.then).toBe("function");
    resolveConfirm(true);
  });

  it("resolveConfirm returns true and closes dialog", async () => {
    const { openConfirm, resolveConfirm, confirmVisible, confirmDialog } =
      await freshModule();
    const p = openConfirm({ message: "?" });
    resolveConfirm(true);
    await expect(p).resolves.toBe(true);
    expect(confirmVisible.value).toBe(false);
    expect(confirmDialog.value).toBe(null);
  });

  it("resolveConfirm false → false", async () => {
    const { openConfirm, resolveConfirm } = await freshModule();
    const p = openConfirm({ message: "?" });
    resolveConfirm(false);
    await expect(p).resolves.toBe(false);
  });

  it("second openConfirm cancels the previous (first resolves false)", async () => {
    const { openConfirm, resolveConfirm } = await freshModule();
    const p1 = openConfirm({ message: "first" });
    const p2 = openConfirm({ message: "second" });
    await expect(p1).resolves.toBe(false);
    resolveConfirm(true);
    await expect(p2).resolves.toBe(true);
  });

  it("custom confirmText / cancelText", async () => {
    const { openConfirm, confirmDialog } = await freshModule();
    openConfirm({
      message: "清空?",
      confirmText: "清空",
      cancelText: "再想想",
    });
    expect(confirmDialog.value.confirmText).toBe("清空");
    expect(confirmDialog.value.cancelText).toBe("再想想");
  });
});
