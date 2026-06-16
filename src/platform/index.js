/**
 * src/platform/index.js
 *
 * 平台抽象层入口 — 按 process.platform 选实现.
 *
 * 业务代码: const platform = require('../platform');
 * 拿到的永远是当前平台的已绑定实现.
 *
 * macOS: src/platform/macos.js (委托现有逻辑, 零行为变更)
 * Windows: src/platform/windows.js (P1 stub, P2/P3/P4 填充)
 * 未知: 回退 windows.js 的 stub 模式 (不崩)
 */

let impl;
if (process.platform === 'darwin') {
  impl = require('./macos');
} else {
  // win32 + 其它一律走 windows.js (P1 全是 stub)
  impl = require('./windows');
}

module.exports = impl;
