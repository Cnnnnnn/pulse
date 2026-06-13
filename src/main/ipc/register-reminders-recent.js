const { ipcMain } = require("electron");
const reminders = require("../reminders");
const recentActivity = require("../recent-activity");

function registerRemindersRecentHandlers(ctx) {
  const { sendToRenderer } = ctx;

  ipcMain.handle("reminders:list", () => {
    try {
      return { ok: true, reminders: reminders.list() };
    } catch (err) {
      return { ok: false, reason: "list_failed", msg: err && err.message };
    }
  });
  ipcMain.handle("reminders:create", (_evt, input) => reminders.create(input));
  ipcMain.handle("reminders:update", (_evt, payload) => {
    if (!payload || typeof payload !== "object")
      return { ok: false, reason: "invalid_input" };
    return reminders.update(payload.id, payload.patch);
  });
  ipcMain.handle("reminders:remove", (_evt, id) => reminders.remove(id));
  ipcMain.handle("reminders:mark-done", (_evt, id) => reminders.markDone(id));
  ipcMain.handle("reminders:mark-dismissed", (_evt, id) =>
    reminders.markDismissed(id),
  );

  ipcMain.handle("recent:list", () => {
    try {
      return { ok: true, entries: recentActivity.list() };
    } catch (err) {
      return { ok: false, reason: "list_failed", msg: err && err.message };
    }
  });
  ipcMain.handle("recent:push", (_evt, entry) => {
    const r = recentActivity.push(entry);
    if (r && r.ok) {
      sendToRenderer("recent:updated", { entries: recentActivity.list() });
    }
    return r;
  });
}

module.exports = { registerRemindersRecentHandlers };
