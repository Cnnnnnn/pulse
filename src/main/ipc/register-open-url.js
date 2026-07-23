/**
 * src/main/ipc/register-open-url.js
 *
 * Universal "open URL in system browser" IPC bridge.
 * Validates URL is http/https to prevent arbitrary protocol abuse.
 *
 * Channel: open-url:open
 *   - payload: string URL (http or https only)
 *   - response: { ok: true } | { ok: false, reason: "unsafe_url" | "shell_failed" }
 */
const { shell } = require("electron");
const { mainLog } = require("../log.ts");

function isSafeUrl(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function registerOpenUrlHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;
  safeHandle("open-url:open", async (_evt, url) => {
    if (!isSafeUrl(url)) {
      mainLog.warn(`[ipc] open-url:open rejected unsafe url: ${url}`);
      return { ok: false, reason: "unsafe_url" };
    }
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      mainLog.warn(`[ipc] open-url:open failed: ${err && err.message}`);
      return { ok: false, reason: "shell_failed" };
    }
  });
}

module.exports = { registerOpenUrlHandlers };