// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const { ipcMain }: { ipcMain: IpcMain } = require("electron");
import * as reminders from "../reminders";
import * as recentActivity from "../recent-activity";

export function registerRemindersRecentHandlers(ctx: any) {
  const { sendToRenderer, safeHandle } = ctx;

  safeHandle("reminders:list", () => {
    try {
      return { ok: true, reminders: reminders.list() };
    } catch (err: any) {
      return { ok: false, reason: "list_failed", msg: errMsg(err) };
    }
  });
  safeHandle(
    "reminders:create",
    (_evt: IpcMainInvokeEvent, input: IpcChannelMap["reminders:create"]["args"][0]) =>
      reminders.create(input),
  );
  safeHandle(
    "reminders:update",
    (
      _evt: IpcMainInvokeEvent,
      payload: IpcChannelMap["reminders:update"]["args"][0],
    ) => {
    if (!payload || typeof payload !== "object")
      return { ok: false, reason: "invalid_input" };
    return reminders.update(payload.id, payload.patch);
    },
  );
  safeHandle(
    "reminders:remove",
    (_evt: IpcMainInvokeEvent, id: IpcChannelMap["reminders:remove"]["args"][0]) =>
      reminders.remove(id),
  );
  safeHandle(
    "reminders:mark-done",
    (_evt: IpcMainInvokeEvent, id: IpcChannelMap["reminders:mark-done"]["args"][0]) =>
      reminders.markDone(id),
  );
  safeHandle(
    "reminders:mark-dismissed",
    (_evt: IpcMainInvokeEvent, id: IpcChannelMap["reminders:mark-dismissed"]["args"][0]) =>
      reminders.markDismissed(id),
  );

  safeHandle("recent:list", () => {
    try {
      return { ok: true, entries: recentActivity.list() };
    } catch (err: any) {
      return { ok: false, reason: "list_failed", msg: errMsg(err) };
    }
  });
  safeHandle(
    "recent:push",
    (
      _evt: IpcMainInvokeEvent,
      entry: IpcChannelMap["recent:push"]["args"][0],
    ) => {
    const r = recentActivity.push(entry);
    if (r && r.ok) {
      sendToRenderer("recent:updated", { entries: recentActivity.list() });
    }
    return r;
    },
  );
}

