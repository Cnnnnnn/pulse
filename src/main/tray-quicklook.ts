/**
 * src/main/tray-quicklook.ts
 *
 * Tray Quick Look — 左键点托盘弹出迷你面板（不打开主窗口）。
 * 右键仍是原 context menu。面板展示：可升级列表 + 检查更新 + 打开主面板。
 *
 * 窗口：frameless + alwaysOnTop + 不抢焦点到 dock；失焦自动藏。
 */

import type { BrowserWindow as BrowserWindowType } from "electron";
import type * as pathType from "node:path";

// ponytail: 不在模块顶层 require electron — 便于 vitest 只测纯函数
// buildQuickLookSnapshot（避免 getElectronPath 在无 Electron 环境炸）。
const path: typeof pathType = require("node:path");

function electron(): any {
  return require("electron");
}

function mainLog(): any {
  try {
    return require("./log.ts").mainLog;
  } catch {
    return { warn() {} };
  }
}

export const QL_WIDTH = 340;
export const QL_HEIGHT = 420;

export type QuickLookSnapshot = {
  total: number;
  updatable: number;
  updates: Array<{
    name: string;
    installed: string;
    latest: string;
  }>;
  upToDateCount: number;
  errorCount: number;
  lastCheckAt: number | null;
  hasChecked: boolean;
};

/** 纯函数：从 detect results 构造快照（单测用） */
export function buildQuickLookSnapshot(
  results: any,
  lastCheckAt: number | null = null,
): QuickLookSnapshot {
  const list = Array.isArray(results) ? results : [];
  const updates = list
    .filter((r: any) => r && r.has_update && r.name)
    .map((r: any) => ({
      name: String(r.name),
      installed: String(r.installed_version || "?"),
      latest: String(r.latest_version || "?"),
    }));
  const upToDate = list.filter((r: any) => r && r.status === "up_to_date").length;
  const errors = list.filter((r: any) => r && r.status === "error").length;
  return {
    total: list.length,
    updatable: updates.length,
    updates,
    upToDateCount: upToDate,
    errorCount: errors,
    lastCheckAt: typeof lastCheckAt === "number" ? lastCheckAt : null,
    hasChecked: list.length > 0,
  };
}

export type TrayQuickLookOpts = {
  getSnapshot: () => QuickLookSnapshot;
  onOpenPanel: () => void;
  onCheck: () => void;
  onFocusUpdate: (data: { rowName: string; action: string }) => void;
  onClose?: () => void;
};

export function createTrayQuickLook(opts: TrayQuickLookOpts) {
  let win: BrowserWindowType | null = null;
  let ipcReady = false;

  function registerIpc() {
    if (ipcReady) return;
    ipcReady = true;
    const { ipcMain } = electron();
    try {
      ipcMain.handle("tray-ql:snapshot", () => {
        try {
          return { ok: true, ...opts.getSnapshot() };
        } catch (err: any) {
          return { ok: false, reason: "snapshot_failed", error: String(err && err.message) };
        }
      });
      ipcMain.on("tray-ql:action", (_evt: any, payload: any) => {
        const action = payload && payload.action;
        try {
          if (action === "open-panel") opts.onOpenPanel();
          else if (action === "check") opts.onCheck();
          else if (action === "focus-update" && payload.rowName) {
            opts.onFocusUpdate({ rowName: String(payload.rowName), action: "upgrade" });
          } else if (action === "hide") hide();
        } catch (err: any) {
          mainLog().warn("[tray-ql] action failed", { action, msg: err && err.message });
        }
      });
    } catch (err: any) {
      mainLog().warn("[tray-ql] registerIpc failed", { msg: err && err.message });
    }
  }

  function positionNearTray(w: BrowserWindowType) {
    try {
      const { screen } = electron();
      const trayBounds = (globalThis as any).__pulse_trayBounds;
      const wa = screen.getPrimaryDisplay().workArea;
      let x = wa.x + wa.width - QL_WIDTH - 12;
      let y = wa.y + 12;
      if (trayBounds && typeof trayBounds.x === "number") {
        x = Math.max(wa.x, Math.min(trayBounds.x - QL_WIDTH / 2, wa.x + wa.width - QL_WIDTH - 8));
        y = wa.y + 8;
      }
      w.setPosition(Math.round(x), Math.round(y), false);
    } catch {
      /* noop */
    }
  }

  function createWindow() {
    registerIpc();
    const { BrowserWindow, app } = electron();
    const htmlPath = path.join(app.getAppPath(), "tray-quicklook.html");
    const created: BrowserWindowType = new BrowserWindow({
      width: QL_WIDTH,
      height: QL_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: "Pulse",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // 面板走专用小 preload（只暴露 ql IPC），不复用主 preload
        preload: path.join(app.getAppPath(), "dist", "tray-ql-preload.js"),
      },
    });
    win = created;
    created.setMenuBarVisibility(false);
    created.loadFile(htmlPath).catch((err: any) => {
      mainLog().warn("[tray-ql] loadFile failed", { msg: err && err.message });
    });
    // 失焦自动藏（macOS 菜单面板习惯）
    created.on("blur", () => {
      try {
        if (win && !win.isDestroyed() && win.isVisible()) win.hide();
      } catch {
        /* noop */
      }
    });
    created.on("closed", () => {
      win = null;
    });
    return created;
  }

  function isVisible(): boolean {
    return !!(win && !win.isDestroyed() && win.isVisible());
  }

  function toggle() {
    try {
      if (isVisible()) {
        win!.hide();
        return;
      }
      if (!win || win.isDestroyed()) createWindow();
      if (!win) return;
      positionNearTray(win);
      win.show();
      win.focus();
      // 刷新数据（页面也会再拉一次，这里保证窗口内最新）
      try {
        if (!win.isDestroyed()) {
          win.webContents.send("tray-ql:refresh", opts.getSnapshot());
        }
      } catch {
        /* noop */
      }
    } catch (err: any) {
      mainLog().warn("[tray-ql] toggle failed", { msg: err && err.message });
    }
  }

  function hide() {
    try {
      if (win && !win.isDestroyed()) win.hide();
    } catch {
      /* noop */
    }
  }

  function dispose() {
    try {
      if (win && !win.isDestroyed()) win.destroy();
    } catch {
      /* noop */
    }
    win = null;
    try {
      const { ipcMain } = electron();
      ipcMain.removeHandler("tray-ql:snapshot");
      ipcMain.removeAllListeners("tray-ql:action");
    } catch {
      /* noop */
    }
    ipcReady = false;
  }

  return { toggle, hide, dispose, isVisible, QL_WIDTH, QL_HEIGHT };
}
