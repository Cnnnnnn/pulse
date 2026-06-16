/**
 * src/platform/macos.js
 *
 * macOS 平台实现 — 现有逻辑的 facade, 零行为变更.
 *
 * 委托关系:
 *   resolveAppPath      → src/utils/app-paths.js
 *   getInstalledVersion → src/workers/installed-version.js
 *   getAppIcon          → src/main/app-icon.js
 *   getUpgradeAction    → src/main/bulk-upgrade-actions.js
 *   execUpgrade         → src/main/bulk-upgrade.js (defaultExec)
 *   getWindowOptions    → 常量 (从现有 window.js 提取)
 */

const { resolveAppBundlePath } = require('../utils/app-paths');
const iv = require('../workers/installed-version');
const appIconMod = require('../main/app-icon');
const { getActionForApp } = require('../main/bulk-upgrade-actions');
const bulkUpgrade = require('../main/bulk-upgrade');

/**
 * macOS 窗口选项 — 跟现有 src/main/window.js createWindow() 的值完全一致.
 * 提取到这里是为了让 window.js 改成读平台层, 但值不变.
 */
const WINDOW_OPTIONS = {
  titleBarStyle: 'hiddenInset',
  vibrancy: 'under-window',
  visualEffectState: 'active',
  transparent: true,
  skipTaskbar: false,
};

function resolveAppPath(bundle, _appCfg) {
  // mac 不需要 appCfg (win 端才需要 win_bundle / reg_path)
  return resolveAppBundlePath(bundle);
}

async function getInstalledVersion(appCfg) {
  const bundle = appCfg && appCfg.bundle ? appCfg.bundle : null;
  const sources =
    appCfg && appCfg.version_sources ? appCfg.version_sources : undefined;
  return iv.getInstalledVersion(bundle, sources);
}

async function getAppIcon(appPath) {
  return appIconMod.getAppIcon(appPath);
}

function getUpgradeAction(_appCfg, detectResult) {
  // getActionForApp 读 item.source / cask / trackId / bundleName / releaseUrl.
  // detectResult 的字段名 (source, brew_cask, track_id, release_url) 要映射到
  // getActionForApp 期望的 (source, cask, trackId, releaseUrl, bundleName).
  const item = {
    id: detectResult && detectResult.name,
    name: detectResult && detectResult.name,
    source: detectResult && detectResult.source,
    cask: detectResult && detectResult.brew_cask,
    trackId: detectResult && detectResult.track_id,
    releaseUrl: detectResult && detectResult.release_url,
    bundleName: detectResult && detectResult.bundle,
  };
  return getActionForApp(item);
}

async function execUpgrade(action) {
  return bulkUpgrade.defaultExec(action);
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
