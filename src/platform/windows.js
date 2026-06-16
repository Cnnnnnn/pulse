/**
 * src/platform/windows.js
 *
 * Windows 平台实现 — P1 阶段全是 stub.
 *
 * 每个 stub 返回安全的 null / default / none, 保证 app 在 Windows 上能 boot
 * (窗口 + 托盘能出来, 不崩). 版本检测此时全标 not_installed, 这是预期行为.
 *
 * 填充计划:
 *   P2: resolveAppPath (注册表) + getInstalledVersion (注册表/winget/yml)
 *   P3: getUpgradeAction (winget) + execUpgrade (winget execFile)
 *   P4: getAppIcon (getFileIcon) + getWindowOptions (titleBarOverlay)
 */

let mainLog = null;
try {
  mainLog = require('../main/log').mainLog;
} catch {
  /* vitest 等环境里 main/log 可能不可用 — stub 不强依赖日志 */
}

const WINDOW_OPTIONS = {
  titleBarStyle: 'hidden',
  backgroundMaterial: 'acrylic', // Win11 生效; Win10 Electron 静默忽略降级纯色
  skipTaskbar: false,
};

function resolveAppPath(bundle, _appCfg) {
  // P1 stub — P2 填注册表 InstallLocation 查询
  if (!bundle || typeof bundle !== 'string') return null;
  if (mainLog && typeof mainLog.debug === 'function') {
    try {
      mainLog.debug('[platform/win] resolveAppPath stub — P2 will implement');
    } catch {
      /* noop */
    }
  }
  return null;
}

async function getInstalledVersion(_appCfg) {
  // P1 stub — P2 填注册表 DisplayVersion → winget list → app-update.yml
  return null;
}

async function getAppIcon(_appPath) {
  // P1 stub — P4 填 app.getFileIcon + toDataURL
  return null;
}

function getUpgradeAction(_appCfg, _detectResult) {
  // P1 stub — P3 填 winget 分支
  return { type: 'none', reason: 'windows upgrade not yet implemented (P3)' };
}

async function execUpgrade(_action) {
  // P1 stub — P3 填 winget execFile
  throw new Error('windows execUpgrade not yet implemented (P3)');
}

function getWindowOptions() {
  return { ...WINDOW_OPTIONS };
}

module.exports = {
  resolveAppPath,
  getInstalledVersion,
  getAppIcon,
  getUpgradeAction,
  execUpgrade,
  getWindowOptions,
};
