/**
 * Stable app metadata IPC exposed to the renderer.
 */

export function registerAppInfoHandlers(ctx: any = {}) {
  const electron = require("electron");
  const ipcMain = ctx.ipcMain || electron.ipcMain;
  const app = ctx.app || electron.app;

  if (!ipcMain || typeof ipcMain.handle !== "function") return;

  ipcMain.handle("app:get-version", async () => {
    try {
      return typeof app.getVersion === "function" ? app.getVersion() : "";
    } catch {
      return "";
    }
  });
}

module.exports = { registerAppInfoHandlers };
