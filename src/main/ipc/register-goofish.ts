/**
 * src/main/ipc/register-goofish.ts
 *
 * 闲鱼嵌入 (v3.3) IPC: renderer 侧 GoofishLayout 驱动主进程 WebContentsView。
 *
 * Channels:
 *   goofish:sync / nav / snapshot — 嵌入几何与导航
 *   goofish:get-prefs / set-prefs — 通知开关
 *   goofish:check-now — 立即 session.sync
 *   goofish:get-auth — 当前登录探测状态
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
  const { loadGoofishPrefs, saveGoofishPrefs } = require("../state-store.ts");
  const {
    goofishNotifyTickNow,
    getGoofishAuthStatus,
  } = require("../goofish/notify-service.ts");

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

  safeHandle("goofish:get-prefs", async (): Promise<
    IpcChannelMap["goofish:get-prefs"]["result"]
  > => {
    try {
      return { ok: true, prefs: loadGoofishPrefs() };
    } catch (err: unknown) {
      return { ok: false, reason: errMsg(err) };
    }
  });

  safeHandle(
    "goofish:set-prefs",
    async (
      _evt: any,
      patch: IpcChannelMap["goofish:set-prefs"]["args"][0],
    ): Promise<IpcChannelMap["goofish:set-prefs"]["result"]> => {
      try {
        saveGoofishPrefs(patch || {});
        return { ok: true, prefs: loadGoofishPrefs() };
      } catch (err: unknown) {
        return { ok: false, reason: errMsg(err) };
      }
    },
  );

  safeHandle("goofish:check-now", async (): Promise<
    IpcChannelMap["goofish:check-now"]["result"]
  > => {
    try {
      await goofishNotifyTickNow();
      return { ok: true, auth: getGoofishAuthStatus() };
    } catch (err: unknown) {
      return { ok: false, reason: errMsg(err) };
    }
  });

  safeHandle("goofish:get-auth", async (): Promise<
    IpcChannelMap["goofish:get-auth"]["result"]
  > => {
    return { ok: true, status: getGoofishAuthStatus() };
  });
}
