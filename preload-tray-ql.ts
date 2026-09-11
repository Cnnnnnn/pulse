/**
 * preload-tray-ql.ts — Tray Quick Look 专用 preload。
 * 只暴露 snapshot + action，不复用主窗口 preload（sandbox 友好、面小）。
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("trayQl", {
  getSnapshot: () => ipcRenderer.invoke("tray-ql:snapshot"),
  action: (payload: { action: string; rowName?: string }) =>
    ipcRenderer.send("tray-ql:action", payload),
  onRefresh: (cb: (snap: unknown) => void) => {
    const handler = (_e: unknown, snap: unknown) => cb(snap);
    ipcRenderer.on("tray-ql:refresh", handler);
    return () => {
      try {
        ipcRenderer.removeListener("tray-ql:refresh", handler);
      } catch {
        /* noop */
      }
    };
  },
});
