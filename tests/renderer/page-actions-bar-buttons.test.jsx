// @vitest-environment happy-dom
// page actions bar 按钮 wiring (前 TopBar 时代, T6).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { PageActionsBar } from "../../src/renderer/components/PageActionsBar.jsx";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    detectResultsExport: vi.fn(async () => ({ ok: true })),
    versionsRunCheck: vi.fn(async () => ({ started: true })),
    releaseNotes: {
      getCurrent: vi.fn(async () => ({
        version: "2.50.0",
        alreadySeen: false,
        changelogMd: "# 2.50.0\n\nnotes",
        slides: null,
      })),
      getVersion: vi.fn(),
      markSeen: vi.fn(),
    },
  },
}));

vi.mock("../../src/renderer/store/toast-store.js", () => ({
  showToast: vi.fn(),
}));

vi.mock("../../src/renderer/store/ai-store.js", () => ({
  toggleDigestDrawer: vi.fn(),
}));

vi.mock("../../src/renderer/watchlist/watchlist-store.js", () => ({
  toggleWatchlistModal: vi.fn(),
}));

vi.mock("../../src/renderer/reminders/remindersStore.js", () => ({
  toggleRemindersOpen: vi.fn(),
}));

vi.mock("../../src/renderer/recent/recentStore.js", () => ({
  toggleRecentOpen: vi.fn(),
}));

vi.mock("../../src/renderer/release-notes-store.js", () => ({
  openReleaseNotes: vi.fn(),
}));

vi.mock("../../src/renderer/route-store.js", () => ({
  navigateTo: vi.fn(),
}));

import { showToast } from "../../src/renderer/store/toast-store.js";
import { toggleDigestDrawer } from "../../src/renderer/store/ai-store.js";
import { toggleWatchlistModal } from "../../src/renderer/watchlist/watchlist-store.js";
import { toggleRemindersOpen } from "../../src/renderer/reminders/remindersStore.js";
import { toggleRecentOpen } from "../../src/renderer/recent/recentStore.js";
import { openReleaseNotes } from "../../src/renderer/release-notes-store.js";
import { navigateTo } from "../../src/renderer/route-store.js";
import { api } from "../../src/renderer/api.js";

beforeEach(() => {
  cleanup();
  // PageActionsBar overflow menu portal 到 document.body, happy-dom 下不会自动 cleanup.
  document.body.querySelectorAll(".page-action-menu-portal").forEach((el) => el.remove());
  vi.clearAllMocks();
});

describe("PageActionsBar buttons wiring (T6)", () => {
  // 菜单 portal 到 document.body, 因此从 document.body 查.
  function findMenuItem(testid) {
    return document.body.querySelector(`[data-testid="${testid}"]`);
  }

  it("'AI 任务' button toggles AI tasks drawer", () => {
    const { container } = render(<PageActionsBar />);
    const btn = container.querySelector('[data-testid="page-action-ai-tasks"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(toggleDigestDrawer).toHaveBeenCalledTimes(1);
  });

  it("overflow menu: 关注列表 toggles watchlist modal", () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-watchlist");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(toggleWatchlistModal).toHaveBeenCalledTimes(1);
  });

  // 2026-06-28: 守护 portal 真的挂到 document.body + 携带 .page-action-menu-portal class.
  // Phase 32 重构漏了 .page-action-menu CSS (没 position:fixed), 菜单 inline top/right
  // 失效, 用户看到 "点了没反应". 这里守护 class 链路, CSS 加载效果肉眼 + build 阶段.
  it("overflow menu 打开后 portal 到 document.body, 带 menu-portal class + 完整菜单项", () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const portal = document.body.querySelector(".page-action-menu-portal");
    expect(portal).toBeTruthy();
    expect(portal.tagName.toLowerCase()).toBe("ul");
    // 7 个菜单项 (关注/诊断/Reminders/Recent + 导出JSON/CSV + Release Notes)
    const items = portal.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(7);
    // 2 个 divider
    expect(portal.querySelectorAll(".page-action-menu-divider").length).toBe(2);
  });

  it("overflow menu: 错误诊断 navigateTo('diagnostics')", () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-diagnostics");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("diagnostics");
  });

  // 回归: portal 菜单的 mousedown 不能冒泡到 document 否则会被 doc listener
  // 先关菜单 (setMenuOpen(false)) → portal 卸载 → click onClick 永远不触发.
  // 用原生 dispatchEvent 走真实事件路径 — React 合成事件 fireEvent.mouseDown 不触发 document listener.
  it("overflow menu: 真实原生 mousedown→mouseup→click 序列不丢 click", () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-diagnostics");
    expect(btn).toBeTruthy();
    // 走原生事件路径, 触发 document.addEventListener("mousedown") listener
    btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(navigateTo).toHaveBeenCalledWith("diagnostics");
  });

  it("overflow menu: Reminders toggles reminders modal", () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-reminders");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(toggleRemindersOpen).toHaveBeenCalledTimes(1);
  });

  it("overflow menu: Recent Activity toggles recent activity modal", () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-recent");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(toggleRecentOpen).toHaveBeenCalledTimes(1);
  });

  it("overflow menu: 导出 JSON 调用 api.detectResultsExport + 成功 toast", async () => {
    api.detectResultsExport.mockResolvedValueOnce({ ok: true, path: "/tmp/x.json" });
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-export-json");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(api.detectResultsExport).toHaveBeenCalledWith({ format: "json" });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining("已导出 JSON"), "success", 3500);
    });
  });

  it("overflow menu: 导出 JSON 失败时弹 error toast", async () => {
    api.detectResultsExport.mockResolvedValueOnce({ ok: false, reason: "write failed: EACCES" });
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    fireEvent.click(findMenuItem("page-action-menu-export-json"));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining("write failed: EACCES"), "error", 3000);
    });
  });

  it("overflow menu: 导出 CSV 调用 api.detectResultsExport", async () => {
    api.detectResultsExport.mockResolvedValueOnce({ ok: true, path: "/tmp/x.csv" });
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-export-csv");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(api.detectResultsExport).toHaveBeenCalledWith({ format: "csv" });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining("已导出 CSV"), "success", 3500);
    });
  });

  it("overflow menu: 导出 JSON 异常 (throw) 弹 error toast", async () => {
    api.detectResultsExport.mockRejectedValueOnce(new Error("boom"));
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    fireEvent.click(findMenuItem("page-action-menu-export-json"));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining("boom"), "error", 3000);
    });
  });

  it("overflow menu: Release Notes 拉 payload 后调 openReleaseNotes('manual', payload)", async () => {
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-release-notes");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(api.releaseNotes.getCurrent).toHaveBeenCalledTimes(1);
      expect(openReleaseNotes).toHaveBeenCalledTimes(1);
    });
    expect(openReleaseNotes).toHaveBeenCalledWith("manual", expect.objectContaining({
      version: "2.50.0",
      changelogMd: expect.any(String),
    }));
  });

  it("overflow menu: Release Notes IPC 缺失时 toast 提示", async () => {
    api.releaseNotes.getCurrent = undefined;
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-release-notes");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Release Notes 暂不可用"),
      "info",
      2500,
    ));
    expect(openReleaseNotes).not.toHaveBeenCalled();
    // 恢复 default mock, 后续 case (payload null) 还能用
    api.releaseNotes.getCurrent = vi.fn(async () => ({
      version: "2.50.0",
      alreadySeen: false,
      changelogMd: "# 2.50.0\n\nnotes",
      slides: null,
    }));
  });

  it("overflow menu: Release Notes payload 为空 (无 release notes) 时 toast", async () => {
    api.releaseNotes.getCurrent.mockResolvedValueOnce(null);
    const { container } = render(<PageActionsBar />);
    fireEvent.click(container.querySelector('[data-testid="page-action-overflow-toggle"]'));
    const btn = findMenuItem("page-action-menu-release-notes");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("当前版本暂无 Release Notes"),
      "info",
      2500,
    ));
    expect(openReleaseNotes).not.toHaveBeenCalled();
  });
});