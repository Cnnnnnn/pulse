// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 跟 src/main/window.ts 同模式.

/* eslint-disable @typescript-eslint/no-explicit-any */

const { resolveAppBundlePath }: {
  resolveAppBundlePath: (b: string) => string | null;
} = require('../utils/app-paths');

function resolveAppPath(bundle: string, _appCfg?: any): string | null {
  return resolveAppBundlePath(bundle);
}

const iv: {
  getInstalledVersion: (
    bundle: string | null,
    sources?: unknown,
  ) => Promise<string | null>;
} = require('../workers/installed-version');

async function getInstalledVersion(appCfg: any): Promise<string | null> {
  const bundle = appCfg && appCfg.bundle ? appCfg.bundle : null;
  const sources =
    appCfg && appCfg.version_sources ? appCfg.version_sources : undefined;
  return iv.getInstalledVersion(bundle, sources);
}

async function getAppIcon(appPath: string): Promise<string | null> {
  const appIconMod: {
    getAppIcon: (p: string) => Promise<string | null>;
  } = require('../main/app-icon.ts');
  return appIconMod.getAppIcon(appPath);
}

function getUpgradeAction(_appCfg: any, detectResult: any): unknown {
  const { getActionForApp }: {
    getActionForApp: (item: any) => unknown;
  } = require('../main/bulk-upgrade-actions.ts');
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

async function execUpgrade(action: unknown): Promise<unknown> {
  // bulk-upgrade.ts 顶部 require('electron'), 不能放模块顶层 (worker 会崩)
  const bulkUpgrade: {
    defaultExec: (a: unknown) => Promise<unknown>;
  } = require('../main/bulk-upgrade.ts');
  return bulkUpgrade.defaultExec(action);
}

const WINDOW_OPTIONS: Record<string, unknown> = {
  titleBarStyle: 'hiddenInset',
  vibrancy: 'under-window',
  visualEffectState: 'active',
  transparent: true,
  skipTaskbar: false,
};

function getWindowOptions(): Record<string, unknown> {
  return { ...WINDOW_OPTIONS };
}

export {
  resolveAppPath,
  getInstalledVersion,
  getAppIcon,
  getUpgradeAction,
  execUpgrade,
  getWindowOptions,
};