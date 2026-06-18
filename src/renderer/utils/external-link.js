/**
 * src/renderer/utils/external-link.js
 *
 * Renderer-side helper to open an external URL via the preload bridge.
 * In Electron, window.api.openUrl goes through IPC to shell.openExternal
 * (validated http/https in main process, see register-open-url.js).
 * Tests / non-Electron environments fall back to window.open().
 */

export async function openExternal(url) {
  if (!url) return;
  if (typeof window !== "undefined" && window.api && typeof window.api.openUrl === "function") {
    try {
      await window.api.openUrl(url);
      return;
    } catch {
      /* noop — open failure surfaces to caller */
    }
  }
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank", "noopener");
  }
}

export default openExternal;