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

const { queryAllUninstallKeys } = require('../workers/win-registry');
const iv = require('../workers/installed-version');

const WINDOW_OPTIONS = {
  titleBarStyle: 'hidden',
  backgroundMaterial: 'acrylic', // Win11 生效; Win10 Electron 静默忽略降级纯色
  skipTaskbar: false,
};

function resolveAppPath(_bundle, appCfg) {
  // P2: Windows 没有 mac 那样的固定 /Applications 路径. 返回 win_bundle 作为存在性标记.
  // task-handlers 在 win 上不走 fs.existsSync (见 handleDetectApp 平台分支),
  // 直接用 getInstalledVersion (走注册表) 判断安装 + 读版本.
  const winBundle = appCfg && appCfg.win_bundle;
  return winBundle || null;
}

async function getInstalledVersion(appCfg) {
  const winBundle = appCfg && appCfg.win_bundle;
  if (!winBundle) return null;

  // 1) 优先走 version_sources (用户显式配的 reg_path / winget 等)
  const sources =
    appCfg && appCfg.version_sources ? appCfg.version_sources : undefined;
  if (Array.isArray(sources) && sources.length > 0) {
    const v = await iv.getInstalledVersion(winBundle, sources);
    if (v) return v;
  }

  // 2) 兜底: 注册表全局扫描 (按 DisplayName 匹配 win_bundle)
  try {
    const regResult = await queryAllUninstallKeys(winBundle);
    if (regResult && regResult.version) return regResult.version;
  } catch {
    /* noop */
  }

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
