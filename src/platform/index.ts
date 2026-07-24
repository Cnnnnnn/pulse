/**
 * src/platform/index.ts
 *
 * 平台抽象层入口 — 按 process.platform 选实现.
 *
 * 业务代码: const platform = require('../platform/index.ts');
 * 拿到的永远是当前平台的已绑定实现.
 *
 * macOS: src/platform/macos.ts (委托现有逻辑, 零行为变更)
 * Windows: src/platform/windows.ts (P1 stub, P2/P3/P4 填充)
 * 未知: 回退 windows.ts 的 stub 模式 (不崩)
 */

// ponytail: `any` ceiling — platform 模块形状跨 mac/win 略有差异 (win 多了 wingetId,
//          mac 多了 cask/trackId). consumer 各自按 platform 方法名 narrow, 不在这里
//          强加统一类型. 升级路径: 抽 PlatformModule interface 放进 shared/, 由
//          macos.ts/windows.ts : PlatformModule.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let impl: any;
if (process.platform === 'darwin') {
  impl = require('./macos.ts');
} else {
  // win32 + 其它一律走 windows.ts (P1 全是 stub)
  impl = require('./windows.ts');
}

module.exports = impl;