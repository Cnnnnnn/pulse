/**
 * src/platform/index.ts
 *
 * 平台抽象层入口 — 按 process.platform 选实现.
 *
 * 业务代码: import platform from '../platform';
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
// ponytail 2: macos.ts/windows.ts 没 ESM export (CJS module.exports), 走 require()
// 兼容. 等 7a-6 batch 阶段统一加 named export 后再换 import.
let impl: any;
if (process.platform === "darwin") {
  impl = require("./macos.js");
} else {
  // win32 + 其它一律走 windows (P1 全是 stub)
  impl = require("./windows.js");
}

// ponytail 3: Phase 7 7a 保留 module.exports, 测试用 requirePlatform('index')
// 拿到整个对象, 不是 { default: obj }. 7b 删 shim 时再去掉 + 改测试用 default.
module.exports = impl;
// ESM default export 让 `import platform from ...` 也能工作 (task-handlers 用).
export default impl;

// ponytail 4: 7a-6 让 `import * as platform from ...` 也能拿到 named methods
// (register-core 等用 namespace import). 跨平台实现可能缺方法, caller 用之前要 narrow.
export const resolveAppPath = impl.resolveAppPath;
export const resolveBundleName = impl.resolveBundleName;
export const getInstalledVersion = impl.getInstalledVersion;
export const getAppIcon = impl.getAppIcon;
export const getUpgradeAction = impl.getUpgradeAction;
export const execUpgrade = impl.execUpgrade;
export const getWindowOptions = impl.getWindowOptions;
