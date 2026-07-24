/**
 * src/platform/windows.ts
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
 *
 * 注意: bulk-upgrade.ts / app-icon-windows.ts 顶部 require('electron'),
 * 而 platform 模块也被 worker thread (task-handlers.js) require —
 * worker 里 require('electron') 会崩. 所以 electron 相关的 require 必须懒加载.
 * worker 只用 resolveAppPath / getInstalledVersion, 不碰这些 electron 方法.
 */

// ponytail: explicit `any` for AppCfg/DetectResult — 字段集合跨 detector/config
//          差异大, 不在这里强加窄类型. 升级路径: 抽 AppCfg/DetectResult interface
//          到 src/shared/types/.
/* eslint-disable @typescript-eslint/no-explicit-any */

let mainLog: unknown = null;
try {
  mainLog = require('../main/log.ts').mainLog;
} catch {
  /* vitest 等环境里 main/log 可能不可用 — stub 不强依赖日志 */
}

const { queryAllUninstallKeys }: {
  queryAllUninstallKeys: (winBundle: string) => Promise<{
    version?: string | null;
  } | null>;
} = require('../workers/win-registry');

function resolveAppPath(_bundle: string, appCfg: any): string | null {
  // P2: Windows 没有 mac 那样的固定 /Applications 路径. 返回 win_bundle 作为存在性标记.
  // task-handlers 在 win 上不走 fs.existsSync (见 handleDetectApp 平台分支),
  // 直接用 getInstalledVersion (走注册表) 判断安装 + 读版本.
  const winBundle = appCfg && appCfg.win_bundle;
  return winBundle || null;
}

const iv: {
  getInstalledVersion: (
    bundle: string,
    sources?: unknown,
  ) => Promise<string | null>;
} = require('../workers/installed-version');

async function getInstalledVersion(appCfg: any): Promise<string | null> {
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

async function getAppIcon(appPath: string): Promise<string | null> {
  // P4: 委托给 src/main/app-icon-windows.ts (走 Electron app.getFileIcon API).
  // 跟 macos.ts 委托给 src/main/app-icon.ts 完全对称.
  // 懒加载 — app-icon-windows.ts require('electron'), 顶层 require 会让 worker 崩.
  if (!appPath || typeof appPath !== 'string') return null;
  const winAppIcon: {
    getAppIcon: (p: string) => Promise<string | null>;
  } = require('../main/app-icon-windows.ts');
  return winAppIcon.getAppIcon(appPath);
}

/**
 * Map a platform-agnostic upgrade item to a winget (or none) action.
 *
 * Per spec §3, Windows app upgrades flow exclusively through winget_show sources.
 * Other sources (sparkle_appcast, electron_yml, etc.) on Windows still go through
 * their respective upgrade paths IF we wire them in a later phase — for P3 we
 * only implement the winget path, so everything else returns 'none'.
 *
 * Field remapping mirrors macos.ts: detectResult carries detector-shaped field
 * names (source, ...), while getActionForApp expects bulk-upgrade-action-shaped
 * names (source, wingetId). The winget_id lives on appCfg (from config.json),
 * NOT on detectResult — detectors don't know about config-level identifiers.
 *
 * Delegates to the shared `bulk-upgrade-actions.getActionForApp` so the action
 * shape is identical to the macOS path and tests/main code stays consistent.
 */
function getUpgradeAction(appCfg: any, detectResult: any): unknown {
  // P3: 把 detectResult 路由给 bulk-upgrade-actions.
  // mac 端 (getActionForApp) 用的字段名 (source / cask / trackId / releaseUrl / bundleName) 跟
  // Windows 端 getActionForApp 用的字段名 (source / wingetId) 略有不同. win 端走 winget_show
  // 分支, 只用 source + winget_id.
  const { getActionForApp }: {
    getActionForApp: (item: any) => unknown;
  } = require('../main/bulk-upgrade-actions.ts');
  const item = {
    id: (detectResult && detectResult.name) || (appCfg && appCfg.name),
    name: (detectResult && detectResult.name) || (appCfg && appCfg.name),
    source: detectResult && detectResult.source,
    wingetId: (appCfg && appCfg.winget_id) || (detectResult && detectResult.winget_id),
  };
  return getActionForApp(item);
}

/**
 * Execute an upgrade action. Delegates to `bulk-upgrade.defaultExec` which now
 * handles winget alongside the macOS brew/mas/open paths. We always use
 * defaultExec (never any winget-specific shortcut) so the execution semantics
 * match exactly across platforms.
 */
async function execUpgrade(action: unknown): Promise<unknown> {
  // 懒加载 — bulk-upgrade.ts require('electron'), 顶层 require 会让 worker 崩.
  const { defaultExec }: {
    defaultExec: (a: unknown) => Promise<unknown>;
  } = require('../main/bulk-upgrade.ts');
  return defaultExec(action);
}

const WINDOW_OPTIONS: Record<string, unknown> = {
  titleBarStyle: 'hidden',
  backgroundMaterial: 'acrylic', // Win11 生效; Win10 Electron 静默忽略降级纯色
  skipTaskbar: false,
};

function getWindowOptions(): Record<string, unknown> {
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