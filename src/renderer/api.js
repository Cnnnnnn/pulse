/**
 * src/renderer/api.js
 *
 * window.api 包装层。preload.js 通过 contextBridge 暴露：
 *   getConfig / checkUpdates / brewUpgrade / brewUpdate /
 *   getAppIcon / openUrl / onCheckProgress / onStartCheck /
 *   bulkUpgradeStart / bulkUpgradeCancel / onBulkUpgradeProgress / onBulkUpgradeDone
 *   (Phase 22 bulk upgrade 新增)
 *
 * 这里包一层：
 *   - 默认从 window.api 取值（生产路径）
 *   - 测试时可注入 mock (overrides)
 *   - 提供一个 clean trigger() helper 给 bootstrap 用
 */

const noop = () => {};

function pick(overrides, name) {
  if (overrides && name in overrides) return overrides[name];
  if (typeof window !== 'undefined' && window.api && window.api[name]) {
    return window.api[name];
  }
  // 兜底 (测试或非 Electron 环境)
  return noop;
}

export function createApi(overrides = {}) {
  return {
    getConfig:       pick(overrides, 'getConfig'),
    getCachedState:  pick(overrides, 'getCachedState'),
    checkUpdates:    pick(overrides, 'checkUpdates'),
    brewUpgrade:     pick(overrides, 'brewUpgrade'),
    brewUpdate:      pick(overrides, 'brewUpdate'),
    getAppIcon:      pick(overrides, 'getAppIcon'),
    openUrl:         pick(overrides, 'openUrl'),
    onCheckProgress: pick(overrides, 'onCheckProgress'),
    onStartCheck:    pick(overrides, 'onStartCheck'),
    onAutoCheckFinished: pick(overrides, 'onAutoCheckFinished'),
    // Phase 22: Bulk Upgrade
    bulkUpgradeStart:  pick(overrides, 'bulkUpgradeStart'),
    bulkUpgradeCancel: pick(overrides, 'bulkUpgradeCancel'),
    onBulkUpgradeProgress: pick(overrides, 'onBulkUpgradeProgress'),
    onBulkUpgradeDone:     pick(overrides, 'onBulkUpgradeDone'),
    // Phase 27: Mutes (per-app 静音)
    getMutes:    pick(overrides, 'getMutes'),
    setMute:     pick(overrides, 'setMute'),
    clearMute:   pick(overrides, 'clearMute'),
    // Phase 29: Last-opened (per-app 最近打开)
    getLastOpened:        pick(overrides, 'getLastOpened'),
    refreshLastOpened:    pick(overrides, 'refreshLastOpened'),
    onLastOpenedUpdated:  pick(overrides, 'onLastOpenedUpdated'),
    // Phase A (App Categorization): active category tab
    getActiveCategory:    pick(overrides, 'getActiveCategory'),
    saveActiveCategory:   pick(overrides, 'saveActiveCategory'),
  };
}

/** 默认实例：绑定到 window.api (生产) */
export const api = createApi();
