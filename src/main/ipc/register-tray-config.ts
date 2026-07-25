/**
 * src/main/ipc/register-tray-config.js
 *
 * Phase v1: Tray 菜单配置选择展示.
 *
 * 4 个 IPC handler:
 *   - 'tray:open-config'  (one-way): main → renderer 推 open 信号,modal 挂载
 *   - 'tray:close-config' (one-way): main → renderer 推 close 信号
 *   - 'tray:get-prefs'    (invoke):   renderer 拉当前 prefs
 *   - 'tray:save-prefs'   (invoke):   renderer 推新 prefs → normalize → 写盘 → setTrayMenuPrefs
 *
 * mainWindow show / focus 由 ctx 提供;trigger rebuild tray menu 走 trayMgr.setTrayMenuPrefs
 * (通过 bootstrap/tray-init 模块级引用,避免循环依赖).
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain } from "electron";

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const { ipcMain }: { ipcMain: IpcMain } = require("electron");
import * as stateStore from "../state-store";
import { normalizePrefs } from "../tray-menu-prefs";
import { mainLog } from "../log";

export function registerTrayConfigHandlers(ctx: any) {
  const { getWindow, safeHandle } = ctx;

  ipcMain.on("tray:open-config", () => {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) {
      try {
        w.show();
        w.focus();
      } catch (err: any) {
        mainLog.warn("[ipc] tray:open-config show/ focus threw", { msg: errMsg(err) });
      }
      try {
        w.webContents.send("tray:open-config");
      } catch (err: any) {
        mainLog.warn("[ipc] tray:open-config send threw", { msg: errMsg(err) });
      }
    }
  });

  ipcMain.on("tray:close-config", () => {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) {
      try {
        w.webContents.send("tray:close-config");
      } catch (err: any) {
        mainLog.warn("[ipc] tray:close-config send threw", { msg: errMsg(err) });
      }
    }
  });

  ipcMain.handle("tray:get-prefs", () => {
    try {
      return { ok: true, prefs: stateStore.loadTrayMenuPrefs() };
    } catch (err: any) {
      mainLog.warn("[ipc] tray:get-prefs threw", { msg: errMsg(err) });
      const { DEFAULT_PREFS } = require("../tray-menu-prefs.ts");
      return { ok: false, reason: "threw", prefs: DEFAULT_PREFS, error: errMsg(err) };
    }
  });

  safeHandle(
    "tray:save-prefs",
    (_event: any, prefs: any) => {
      // normalizePrefs 已经在内部过滤未知 key / 补默认 true.
      const normalized = normalizePrefs(prefs);
      let saved;
      try {
        saved = stateStore.saveTrayMenuPrefs(normalized);
      } catch (err: any) {
        return { ok: false, reason: "write_failed", error: errMsg(err) };
      }
      // 通知 tray 立刻 rebuild (main 端单一真相,renderer 不持有 prefs state).
      try {
        const { getTrayManager } = require("../bootstrap/tray-init.ts");
        const trayMgr = getTrayManager();
        if (trayMgr && typeof trayMgr.setTrayMenuPrefs === "function") {
          trayMgr.setTrayMenuPrefs(saved.tray_menu_prefs || normalized);
        }
      } catch (err: any) {
        mainLog.warn("[ipc] tray:save-prefs trayMgr update threw", { msg: errMsg(err) });
      }
      return { ok: true, prefs: saved.tray_menu_prefs || normalized };
    },
    {
      logMeta: () => ({}),
      onError: (err: any) => ({ ok: false, reason: "threw", error: errMsg(err) }),
    },
  );
}

module.exports = { registerTrayConfigHandlers };