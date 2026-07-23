/**
 * src/main/bootstrap/tray-init.ts
 *
 * 轻量桥: 让 IPC handler 能拿到 trayMgr 而不直接 require index.js (会循环).
 *
 * 用法:
 *   - index.js 创建 trayMgr 后:  setTrayManager(trayMgr)
 *   - IPC handler:  getTrayManager() → trayMgr (或 null)
 *   - 测试 / 启动早期:  getTrayManager() → null,调用方需兜底
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type {} from "electron";

let _trayMgr = null;

function setTrayManager(m) {
  _trayMgr = m;
}

function getTrayManager() {
  return _trayMgr;
}

module.exports = { setTrayManager, getTrayManager };
