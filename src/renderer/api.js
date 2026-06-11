/**
 * src/renderer/api.js
 *
 * window.api包装层。preload.js 通过 contextBridge暴露：
 * getConfig / checkUpdates / brewUpgrade / brewUpdate /
 * getAppIcon / openUrl / onCheckProgress / onStartCheck /
 * bulkUpgradeStart / bulkUpgradeCancel / onBulkUpgradeProgress / onBulkUpgradeDone
 * (Phase22 bulk upgrade 新增)
 *
 * 这里包一层：
 * - 默认从 window.api 取值（生产路径）
 * - 测试时可注入 mock (overrides)
 * - 提供一个 clean trigger() helper 给 bootstrap 用
 */

const noop = () => {};

function pick(overrides, name) {
 if (overrides && name in overrides) return overrides[name];
 if (typeof window !== 'undefined' && window.api && window.api[name]) {
 return window.api[name];
 }
 //兜底 (测试或非 Electron 环境)
 return noop;
}

export function createApi(overrides = {}) {
 return {
 getConfig: pick(overrides, 'getConfig'),
 getCachedState: pick(overrides, 'getCachedState'),
 checkUpdates: pick(overrides, 'checkUpdates'),
 brewUpgrade: pick(overrides, 'brewUpgrade'),
 brewUpdate: pick(overrides, 'brewUpdate'),
 getAppIcon: pick(overrides, 'getAppIcon'),
 openUrl: pick(overrides, 'openUrl'),
 onCheckProgress: pick(overrides, 'onCheckProgress'),
 onCheckDetecting: pick(overrides, 'onCheckDetecting'),
 onStartCheck: pick(overrides, 'onStartCheck'),
 onAutoCheckFinished: pick(overrides, 'onAutoCheckFinished'),
 // Phase22: Bulk Upgrade
 bulkUpgradeStart: pick(overrides, 'bulkUpgradeStart'),
 bulkUpgradeCancel: pick(overrides, 'bulkUpgradeCancel'),
 onBulkUpgradeProgress: pick(overrides, 'onBulkUpgradeProgress'),
 onBulkUpgradeDone: pick(overrides, 'onBulkUpgradeDone'),
 // Phase27: Mutes (per-app静音)
 getMutes: pick(overrides, 'getMutes'),
 setMute: pick(overrides, 'setMute'),
 clearMute: pick(overrides, 'clearMute'),
 // Phase29: Last-opened (per-app 最近打开)
 getLastOpened: pick(overrides, 'getLastOpened'),
 refreshLastOpened: pick(overrides, 'refreshLastOpened'),
 onLastOpenedUpdated: pick(overrides, 'onLastOpenedUpdated'),
 // Phase A (App Categorization): active category tab
 getActiveCategory: pick(overrides, 'getActiveCategory'),
 saveActiveCategory: pick(overrides, 'saveActiveCategory'),
// AI 任务总结 (重做版)
  listAiTasks: pick(overrides, 'listAiTasks'),
  summarizeAiTasks: pick(overrides, 'summarizeAiTasks'),
  onAiTaskSummaryUpdated: pick(overrides, 'onAiTaskSummaryUpdated'),
  // 跳到原始 session
  openSession: pick(overrides, 'openSession'),
  // Phase B6c (AI Sessions Settings)
 setAiKey: pick(overrides, 'setAiKey'),
 clearAiKey: pick(overrides, 'clearAiKey'),
 hasAiKey: pick(overrides, 'hasAiKey'),
 aiHealthcheck: pick(overrides, 'aiHealthcheck'),
 getAiSessionsConfig: pick(overrides, 'getAiSessionsConfig'),
 saveAiSessionsConfig: pick(overrides, 'saveAiSessionsConfig'),
 onAiSessionsConfigUpdated: pick(overrides, 'onAiSessionsConfigUpdated'),
  // v2.7.0 (My Apps Library)
  libraryListUnmonitored: pick(overrides, 'libraryListUnmonitored'),
  libraryAdd: pick(overrides, 'libraryAdd'),
  libraryRemove: pick(overrides, 'libraryRemove'),
  librarySetSortBy: pick(overrides, 'librarySetSortBy'),
  librarySetPinned: pick(overrides, 'librarySetPinned'),
  librarySetIgnored: pick(overrides, 'librarySetIgnored'),
  librarySetTags: pick(overrides, 'librarySetTags'),
  onConfigUpdated: pick(overrides, 'onConfigUpdated'),
  // v2.7.2 (Auto-Detect)
  libraryAutoDetect: pick(overrides, 'libraryAutoDetect'),
 };
}

/** 默认实例：绑定到 window.api (生产) */
export const api = createApi();
