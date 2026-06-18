/**
 * src/renderer/utils/external-link.js
 *
 * Renderer-side helper to open an external URL via the preload bridge.
 * 在 Electron 环境里 window.api.openUrl 会经 IPC 调 shell.openExternal;
 * 浏览器/测试环境下回退 window.open(noopener)。
 */

export async function openExternal(url) {
  if (!url) return;
  if (typeof window !== "undefined" && window.api && typeof window.api.openUrl === "function") {
    try {
      await window.api.openUrl(url);
      return;
    } catch {
      /* fall through to window.open */
    }
  }
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank", "noopener");
  }
}

export default openExternal;