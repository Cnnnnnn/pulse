// @vitest-environment happy-dom
/**
 * tests/renderer/confirm-dialog.test.jsx
 *
 * ConfirmDialog 组件 — happy-dom 环境.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/preact";
import { signal } from "@preact/signals";

async function freshModule() {
  vi.resetModules();
  return await import("../../src/renderer/components/ConfirmDialog.jsx");
}

beforeEach(() => {
  // 重置 store
  vi.resetModules();
});

describe("ConfirmDialog", () => {
  it("renders nothing when not visible", async () => {
    const { ConfirmDialog } = await freshModule();
    const { container } = render(<ConfirmDialog />);
    expect(container.querySelector(".confirm-dialog")).toBeNull();
  });

  it("shows title + message + buttons when confirmDialog set", async () => {
    const { ConfirmDialog } = await freshModule();
    const store = await import("../../src/renderer/store/confirmStore.js");
    store.confirmDialog.value = {
      title: "删除提醒",
      message: "确定删除 \"X\"?",
      confirmText: "删除",
      cancelText: "再想想",
    };
    store.confirmVisible.value = true;
    render(<ConfirmDialog />);
    expect(document.body.querySelector(".confirm-dialog-title").textContent).toBe(
      "删除提醒",
    );
    expect(document.body.querySelector(".confirm-dialog-message").textContent).toBe(
      '确定删除 "X"?',
    );
    expect(document.body.querySelectorAll(".confirm-dialog-actions button")[0].textContent).toBe(
      "再想想",
    );
    expect(document.body.querySelectorAll(".confirm-dialog-actions button")[1].textContent).toBe(
      "删除",
    );
    // 复位
    store.confirmVisible.value = false;
    store.confirmDialog.value = null;
  });

  it("click confirm button → resolveConfirm(true) → dialog hides", async () => {
    const { ConfirmDialog } = await freshModule();
    const store = await import("../../src/renderer/store/confirmStore.js");
    const promise = store.openConfirm({ message: "?" });
    render(<ConfirmDialog />);
    const confirmBtn = document.body.querySelectorAll(".confirm-dialog-actions button")[1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await expect(promise).resolves.toBe(true);
    expect(store.confirmVisible.value).toBe(false);
  });

  it("click cancel button → resolveConfirm(false)", async () => {
    const { ConfirmDialog } = await freshModule();
    const store = await import("../../src/renderer/store/confirmStore.js");
    const promise = store.openConfirm({ message: "?" });
    render(<ConfirmDialog />);
    const cancelBtn = document.body.querySelectorAll(".confirm-dialog-actions button")[0];
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    await expect(promise).resolves.toBe(false);
  });

  it("click backdrop closes with false", async () => {
    const { ConfirmDialog } = await freshModule();
    const store = await import("../../src/renderer/store/confirmStore.js");
    const promise = store.openConfirm({ message: "?" });
    render(<ConfirmDialog />);
    const backdrop = document.body.querySelector(".confirm-dialog-backdrop");
    await act(async () => {
      fireEvent.click(backdrop);
    });
    await expect(promise).resolves.toBe(false);
  });
});
