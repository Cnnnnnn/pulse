/**
 * src/renderer/upgrade-actions.js
 *
 * 触发单个 app 的升级流程: 走已有 bulk-upgrade flow (openBulkUpgrade + bulkUpgradeStart IPC).
 * 由 tray-focus 在 action === 'upgrade' 时调用.
 */
import { taggedLog } from "./log.js";
import { results } from "./store.js";
import { openBulkUpgrade } from "./store-bulk-upgrade.js";

const log = taggedLog("[upgrade-actions]");

/**
 * 把 result 转换成 bulk-upgrade item (与 BulkUpgradeButton.toBulkItem 保持一致).
 * @param {object} r
 */
function toBulkItem(r) {
  return {
    id: r.name,
    name: r.name,
    source: r.source || "",
    current: r.installed_version || "",
    latest: r.latest_version || "",
    cask: r.brew_cask || "",
    bundleName: r.name,
    trackId: r.track_id || r.trackId || 0,
    releaseUrl: r.release_url || r.releaseUrl || "",
  };
}

/**
 * 触发单个 app 升级.
 * 1) 用 openBulkUpgrade 打开 modal 并设好 items
 * 2) 立即调 window.api.bulkUpgradeStart(items) 起跑 (modal 内 Start 按钮的行为)
 * @param {string} appName
 */
export async function requestUpgrade(appName) {
  if (!appName) return;
  const result = results.value.get(appName);
  if (!result) {
    log.warn(`requestUpgrade: app "${appName}" not in results store`);
    return;
  }
  const item = toBulkItem(result);
  log.info(`requestUpgrade: ${appName}`);
  try {
    openBulkUpgrade([item]);
  } catch (err) {
    log.warn("openBulkUpgrade failed:", err && err.message);
    return;
  }
  try {
    if (window.api && typeof window.api.bulkUpgradeStart === "function") {
      await window.api.bulkUpgradeStart([item]);
    }
  } catch (err) {
    log.warn("bulkUpgradeStart failed:", err && err.message);
  }
}
