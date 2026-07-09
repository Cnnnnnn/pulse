/**
 * 主题切换 IPC 桥接 (P10)
 *
 * - theme:get   → 返回当前偏好 (mode: 'system'|'light'|'dark')
 * - theme:set   → 主进程记录 + 广播 'theme:changed' 给 renderer (触发 data-theme 切换)
 * - theme:changed (主→renderer) → renderer apply + 写 localStorage
 * - theme:changed (renderer→主) → rebuildTrayMenu + 标记选中
 *
 * 设计：renderer 的 localStorage 是单一真相 (持久化),
 *       主进程内存 lastThemeMode 仅用于 tray 当前选中标记.
 *       启动时 renderer 主动拉 theme:get → 主进程返回默认值 'system',
 *       renderer 用 localStorage 覆盖 apply, 再 IPC theme:set 同步给主进程.
 */
const { ipcMain, nativeTheme } = require("electron");
const { mainLog } = require("../log");

const VALID = ["system", "light", "dark"];
let lastThemeMode = "system"; // 主进程内存, 重启时重置为 system.

function resolveTheme(mode) {
  if (mode === "system") return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  return mode === "dark" ? "dark" : "light";
}

function registerThemeHandlers(ctx) {
  const { sendToRenderer } = ctx;

  // 监听系统外观变化: 'system' 模式下同步给 renderer (tray icon 已经在 install() 监听了).
  // 这里只负责 IPC 广播, 不动 lastThemeMode (用户偏好).
  nativeTheme.on("updated", () => {
    if (lastThemeMode === "system") {
      const resolved = resolveTheme("system");
      mainLog.info(`[theme] nativeTheme updated → system mode resolved = ${resolved}`);
      if (typeof sendToRenderer === "function") {
        sendToRenderer("theme:changed", { mode: "system", resolved });
      }
    }
  });

  ipcMain.handle("theme:get", () => {
    return { mode: lastThemeMode, resolved: resolveTheme(lastThemeMode) };
  });

  ipcMain.handle("theme:set", (_event, mode) => {
    const m = VALID.includes(mode) ? mode : "system";
    lastThemeMode = m;
    mainLog.info(`[theme] main process lastThemeMode = ${m}`);
    // 广播给所有 renderer, 让打开的窗口统一跟随.
    if (typeof sendToRenderer === "function") {
      sendToRenderer("theme:changed", { mode: m, resolved: resolveTheme(m) });
    }
    return { mode: m, resolved: resolveTheme(m) };
  });
}

module.exports = { registerThemeHandlers };