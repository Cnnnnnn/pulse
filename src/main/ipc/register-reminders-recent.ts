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
  const { sendToRenderer } = ctx;

  ipcMain.handle("reminders:list", () => {
    try {
      return { ok: true, reminders: reminders.list() };
    } catch (err: any) {
      return { ok: false, reason: "list_failed", msg: errMsg(err) };
    }
  });
  ipcMain.handle(
    "reminders:create",
    (_evt: IpcMainInvokeEvent, input: IpcChannelMap["reminders:create"]["args"][0]) =>
      reminders.create(input),
  );
  ipcMain.handle(
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
  ipcMain.handle(
    "reminders:remove",
    (_evt: IpcMainInvokeEvent, id: IpcChannelMap["reminders:remove"]["args"][0]) =>
      reminders.remove(id),
  );
  ipcMain.handle(
    "reminders:mark-done",
    (_evt: IpcMainInvokeEvent, id: IpcChannelMap["reminders:mark-done"]["args"][0]) =>
      reminders.markDone(id),
  );
  ipcMain.handle(
    "reminders:mark-dismissed",
    (_evt: IpcMainInvokeEvent, id: IpcChannelMap["reminders:mark-dismissed"]["args"][0]) =>
      reminders.markDismissed(id),
  );

  ipcMain.handle("recent:list", () => {
    try {
      return { ok: true, entries: recentActivity.list() };
    } catch (err: any) {
      return { ok: false, reason: "list_failed", msg: errMsg(err) };
    }
  });
  ipcMain.handle(
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

module.exports = { registerRemindersRecentHandlers };
