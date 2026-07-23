/**
 * src/main/bootstrap/send-to-renderer.ts
 *
 * 顶层 sendToRenderer helper — 推 IPC 事件给 renderer window.
 * winMgr 通过 deps 注入, 避免在 main/index.js 与各 bootstrap 文件间共享模块级变量.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type {} from "electron";

const { mainLog } = require("../log.ts");

/**
 * @param {{ getWindow: () => import('electron').BrowserWindow | null }} deps
 */
function createSender(deps) {
  return function sendToRenderer(channel, payload) {
    const w = deps.getWindow && deps.getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  };
}

function installErrorGuardBridge(sendToRenderer) {
  const { installErrorGuard } = require("../error-guard");
  installErrorGuard((channel, payload) => sendToRenderer(channel, payload));
  mainLog.info("error guard installed");
}

module.exports = { createSender, installErrorGuardBridge };
