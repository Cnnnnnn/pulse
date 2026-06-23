// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { VersionHistoryDrawer } from "../../src/renderer/components/VersionHistoryDrawer.jsx";
import {
  versionHistoryOpen,
  versionHistoryApp,
  versionHistoryEntries,
  versionHistoryTotalSize,
  versionHistoryLoading,
  closeVersionHistory,
  openVersionHistory,
} from "../../src/renderer/store-version-history.js";

describe("VersionHistoryDrawer", () => {
  let onUpdatedListeners;
  beforeEach(() => {
    cleanup();
    versionHistoryOpen.value = false;
    versionHistoryApp.value = null;
    versionHistoryEntries.value = [];
    versionHistoryTotalSize.value = 0;
    versionHistoryLoading.value = false;
    onUpdatedListeners = [];
    // 装一个 minimal window.api stub. 真实桥接在 Task 8.
    global.window.api = {
      getVersionHistory: vi.fn(async (name) => ({
        ok: true,
        entries: [
          {
            from: "3.6.31",
            to: "3.6.32",
            at: 1700000000000,
            backupPath: `/fake/${name}.app/3.6.31.app`,
            source: "brew_formulae",
            sizeBytes: 1024 * 1024,
          },
          {
            from: "3.6.30",
            to: "3.6.31",
            at: 1699990000000,
            backupPath: `/fake/${name}.app/3.6.30.app`,
            source: "brew_formulae",
            sizeBytes: 900 * 1024,
          },
        ],
        totalSizeBytes: (1024 + 900) * 1024,
      })),
      rollbackApp: vi.fn(async (appName, version) => ({ ok: true, appName, version })),
      deleteBackup: vi.fn(async (appName, version) => ({ ok: true, freedBytes: 1024 * 1024 })),
      onVersionHistoryUpdated: vi.fn((cb) => {
        onUpdatedListeners.push(cb);
        return () => {
          const i = onUpdatedListeners.indexOf(cb);
          if (i >= 0) onUpdatedListeners.splice(i, 1);
        };
      }),
    };
  });

  afterEach(() => {
    closeVersionHistory();
    delete global.window.api;
    vi.restoreAllMocks();
  });

  it("drawer closed → render null", () => {
    const { container } = render(<VersionHistoryDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it("drawer 打开 + fetch + 渲染 entries + total size", async () => {
    openVersionHistory("Cursor");
    const { container } = render(<VersionHistoryDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain("v3.6.32");
      expect(container.textContent).toContain("v3.6.31");
    });
    expect(container.textContent).toContain("1.9 MB"); // 1024+900 KB
    expect(window.api.getVersionHistory).toHaveBeenCalledWith("Cursor");
  });

  it("entries 为空 → 显示 empty 提示", async () => {
    window.api.getVersionHistory.mockResolvedValueOnce({
      ok: true,
      entries: [],
      totalSizeBytes: 0,
    });
    openVersionHistory("Things");
    const { container } = render(<VersionHistoryDrawer />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/暂无备份|empty/);
    });
  });

  it("点击关闭 → drawer 关闭", () => {
    versionHistoryOpen.value = true;
    versionHistoryApp.value = "Cursor";
    const { getByText } = render(<VersionHistoryDrawer />);
    fireEvent.click(getByText("×"));
    expect(versionHistoryOpen.value).toBe(false);
    expect(versionHistoryApp.value).toBeNull();
  });

  it("点击 回滚到这版 → 调 api.rollbackApp + 关闭 drawer (成功后)", async () => {
    openVersionHistory("Cursor");
    const { container } = render(<VersionHistoryDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain("v3.6.32");
    });
    const btn = container.querySelector("button.btn-primary");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(window.api.rollbackApp).toHaveBeenCalledWith("Cursor", "3.6.32");
    });
    // 成功 → drawer 关闭
    expect(versionHistoryOpen.value).toBe(false);
  });

  it("点击 删除 → 调 api.deleteBackup (entries 由 store 自己维护)", async () => {
    openVersionHistory("Cursor");
    const { container } = render(<VersionHistoryDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain("v3.6.32");
    });
    const deleteBtn = container.querySelector("button.btn-danger");
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(window.api.deleteBackup).toHaveBeenCalledWith("Cursor", "3.6.32");
    });
    // 删除成功后 entries 应当少一条 (store 自己 filter)
    await waitFor(() => {
      const remaining = versionHistoryEntries.value;
      expect(remaining.find((e) => e.to === "3.6.32")).toBeUndefined();
    });
  });

  it("回滚失败 → drawer 保持打开, 不调 onVersionHistoryUpdated 但 log warn", async () => {
    window.api.rollbackApp.mockResolvedValueOnce({ ok: false, reason: "backup_missing" });
    openVersionHistory("Cursor");
    const { container } = render(<VersionHistoryDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain("v3.6.32");
    });
    const btn = container.querySelector("button.btn-primary");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(window.api.rollbackApp).toHaveBeenCalled();
    });
    // 失败 → drawer 仍开
    expect(versionHistoryOpen.value).toBe(true);
  });

  it("监听 onVersionHistoryUpdated → payload 匹配 appName 时 refetch", async () => {
    openVersionHistory("Cursor");
    const { container } = render(<VersionHistoryDrawer />);
    await waitFor(() => {
      expect(window.api.getVersionHistory).toHaveBeenCalledTimes(1);
    });
    // 模拟 main broadcast
    onUpdatedListeners.forEach((cb) => cb({ appName: "Cursor" }));
    await waitFor(() => {
      expect(window.api.getVersionHistory).toHaveBeenCalledTimes(2);
    });
    // 不匹配的 appName → 不 refetch
    onUpdatedListeners.forEach((cb) => cb({ appName: "Other" }));
    // 给一帧
    await new Promise((r) => setTimeout(r, 10));
    expect(window.api.getVersionHistory).toHaveBeenCalledTimes(2);
  });
});