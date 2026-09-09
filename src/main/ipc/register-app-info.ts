/**
 * Stable app metadata IPC exposed to the renderer.
 */

export function registerAppInfoHandlers(ctx: any = {}) {
  const electron = require("electron");
  const ipcMain = ctx.ipcMain || electron.ipcMain;
  const app = ctx.app || electron.app;

  if (!ipcMain || typeof ipcMain.handle !== "function") return;

  const safeHandle =
    typeof ctx.safeHandle === "function"
      ? ctx.safeHandle
      : (channel: string, fn: (...args: any[]) => any) => {
          // 本地兜底必须走 ipcMain.handle，不能自引用 safeHandle
          ipcMain.handle(channel, async (...args: any[]) => {
            try {
              return await fn(...args);
            } catch {
              return { ok: false, reason: "threw" };
            }
          });
        };

  safeHandle("app:get-version", async () => {
    try {
      return typeof app.getVersion === "function" ? app.getVersion() : "";
    } catch {
      return "";
    }
  });
}

