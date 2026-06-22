// @vitest-environment happy-dom
/**
 * tests/renderer/tray-config-modal.test.jsx
 *
 * TrayMenuConfigModal 组件 — happy-dom 环境.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/preact";

function stubTrayApi(overrides = {}) {
  const calls = { savePrefsArgs: null, getPrefsCount: 0 };
  const stub = {
    openConfig: vi.fn(),
    closeConfigModal: vi.fn(),
    getPrefs: vi.fn(async () => {
      calls.getPrefsCount += 1;
      return { ok: true, prefs: { version: 1, segments: {
        updates: true, ai_usage: true, worldcup: true, metals: true,
        check_action: true, config_action: true,
      } } };
    }),
    savePrefs: vi.fn(async (prefs) => {
      calls.savePrefsArgs = prefs;
      return { ok: true, prefs };
    }),
    onOpenConfig: vi.fn(() => () => {}),
    onCloseConfigModal: vi.fn(() => () => {}),
    ...overrides,
  };
  window.pulse = { tray: stub };
  return { stub, calls };
}

async function freshStoreAndModal() {
  vi.resetModules();
  const store = await import("../../src/renderer/trayConfigStore.js");
  store.trayConfigOpen.value = false;
  const { TrayMenuConfigModal } = await import("../../src/renderer/components/TrayMenuConfigModal.jsx");
  return { store, TrayMenuConfigModal };
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
});

describe("TrayMenuConfigModal", () => {
  it("modal 关闭时不渲染任何东西", async () => {
    stubTrayApi();
    const { store, TrayMenuConfigModal } = await freshStoreAndModal();
    store.trayConfigOpen.value = false;
    const { container } = render(<TrayMenuConfigModal />);
    expect(container.querySelector(".tray-config-modal")).toBeNull();
  });

  it("modal 打开 → 显示加载中,然后切到 6 个 checkbox", async () => {
    stubTrayApi();
    const { store, TrayMenuConfigModal } = await freshStoreAndModal();
    store.trayConfigOpen.value = true;
    render(<TrayMenuConfigModal />);
    // 加载中文案
    expect(document.body.querySelector(".tray-config-modal-loading")).toBeTruthy();
    // 等 getPrefs resolve
    await waitFor(() => {
      expect(document.body.querySelectorAll(".tray-config-segment-row")).toHaveLength(6);
    });
  });

  it("getPrefs 失败 → 显示「加载失败」+ 关闭按钮 (不抛)", async () => {
    stubTrayApi({
      getPrefs: vi.fn(async () => ({ ok: false, reason: "threw", prefs: null })),
    });
    const { store, TrayMenuConfigModal } = await freshStoreAndModal();
    store.trayConfigOpen.value = true;
    render(<TrayMenuConfigModal />);
    await waitFor(() => {
      expect(document.body.querySelector(".tray-config-modal-error")).toBeTruthy();
    });
  });

  it("切换 checkbox → 保存按钮从 disabled 变 enabled", async () => {
    stubTrayApi();
    const { store, TrayMenuConfigModal } = await freshStoreAndModal();
    store.trayConfigOpen.value = true;
    render(<TrayMenuConfigModal />);
    await waitFor(() => {
      expect(document.body.querySelectorAll(".tray-config-segment-row")).toHaveLength(6);
    });
    const saveBtn = document.body.querySelector(".tray-config-save");
    expect(saveBtn.disabled).toBe(true);
    // 点 updates checkbox
    const updatesCheckbox = document.body.querySelectorAll(".tray-config-segment-row input[type=checkbox]")[0];
    await act(async () => {
      fireEvent.click(updatesCheckbox);
    });
    expect(saveBtn.disabled).toBe(false);
  });

  it("点保存 → 调 savePrefs,传入完整 6 个 key 的 segments", async () => {
    const { stub, calls } = stubTrayApi();
    const { store, TrayMenuConfigModal } = await freshStoreAndModal();
    store.trayConfigOpen.value = true;
    render(<TrayMenuConfigModal />);
    await waitFor(() => {
      expect(document.body.querySelectorAll(".tray-config-segment-row")).toHaveLength(6);
    });
    // 关掉 updates + worldcup
    const checkboxes = document.body.querySelectorAll(".tray-config-segment-row input[type=checkbox]");
    await act(async () => {
      fireEvent.click(checkboxes[0]); // updates off
    });
    await act(async () => {
      fireEvent.click(checkboxes[2]); // worldcup off
    });
    const saveBtn = document.body.querySelector(".tray-config-save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await waitFor(() => {
      expect(stub.savePrefs).toHaveBeenCalled();
    });
    const arg = calls.savePrefsArgs;
    expect(arg.segments).toBeDefined();
    expect(Object.keys(arg.segments).sort()).toEqual([
      "ai_usage", "check_action", "config_action", "metals", "updates", "worldcup",
    ]);
    expect(arg.segments.updates).toBe(false);
    expect(arg.segments.worldcup).toBe(false);
    expect(arg.segments.ai_usage).toBe(true);
  });

  it("点取消 → 调 closeConfigModal (renderer 端发 IPC 让 main 决定)", async () => {
    const { stub } = stubTrayApi();
    const { store, TrayMenuConfigModal } = await freshStoreAndModal();
    store.trayConfigOpen.value = true;
    render(<TrayMenuConfigModal />);
    await waitFor(() => {
      expect(document.body.querySelectorAll(".tray-config-segment-row")).toHaveLength(6);
    });
    const cancelBtn = document.body.querySelector(".tray-config-cancel");
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    expect(stub.closeConfigModal).toHaveBeenCalled();
  });
});
