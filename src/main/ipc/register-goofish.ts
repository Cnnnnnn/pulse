/**
 * src/main/ipc/register-goofish.ts
 *
 * 闲鱼嵌入 (v3.3) IPC: renderer 侧 GoofishLayout 驱动主进程 WebContentsView。
 *
 * Channels:
 *   goofish:sync — 嵌入区几何 + 可见性同步 (ResizeObserver / 挂卸载驱动)
 *   goofish:nav  — 导航指令 (home / reload / load, load 限 goofish.com 域)
 */

import type { BrowserWindow } from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerGoofishHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;
  const { BrowserWindow: BW } = require("electron") as {
    BrowserWindow: typeof BrowserWindow;
  };
  const { goofishEmbedSync, goofishEmbedNav, goofishEmbedSnapshot } = require(
    "../goofish-embed.ts",
  );

  const winOf = (evt: any): BrowserWindow | null => {
    try {
      return BW.fromWebContents(evt.sender) || null;
    } catch {
      return null;
    }
  };

  safeHandle(
    "goofish:sync",
    async (
      evt: any,
      payload: IpcChannelMap["goofish:sync"]["args"][0],
    ): Promise<IpcChannelMap["goofish:sync"]["result"]> => {
      try {
        return goofishEmbedSync(winOf(evt), payload);
      } catch (err: unknown) {
        return { ok: false, reason: errMsg(err) };
      }
    },
  );

  safeHandle(
    "goofish:nav",
    async (
      evt: any,
      payload: IpcChannelMap["goofish:nav"]["args"][0],
    ): Promise<IpcChannelMap["goofish:nav"]["result"]> => {
      try {
        return goofishEmbedNav(winOf(evt), payload);
      } catch (err: unknown) {
        return { ok: false, reason: errMsg(err) };
      }
    },
  );

  safeHandle("goofish:snapshot", async (): Promise<
    IpcChannelMap["goofish:snapshot"]["result"]
  > => {
    try {
      return await goofishEmbedSnapshot();
    } catch {
      return { ok: false };
    }
  });
}
