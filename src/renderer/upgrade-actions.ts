/**
 * src/renderer/upgrade-actions.ts
 *
 * 触发单个/批量 app 升级流程.
 */
import { taggedLog } from "./log.ts";
import { results } from "./store.ts";
import { openBulkUpgrade } from "./store/store-bulk-upgrade.ts";

const log = taggedLog("[upgrade-actions]");

export function toBulkItem(r: any) {
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

export function collectUpgradableItems(): any[] {
  const resMap = results.value;
  if (!(resMap instanceof Map)) return [];
  const items: any[] = [];
  for (const [, r] of resMap.entries()) {
    if (r && r.has_update) items.push(toBulkItem(r));
  }
  return items;
}

/**
 * 触发单个 app 升级.
 */
export async function requestUpgrade(appName: string) {
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
  } catch (err: any) {
    log.warn("openBulkUpgrade failed:", err instanceof Error ? err.message : err);
    return;
  }
  try {
    if (window.api && typeof window.api.bulkUpgradeStart === "function") {
      await window.api.bulkUpgradeStart([item]);
    }
  } catch (err: any) {
    log.warn("bulkUpgradeStart failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * 批量升级所有有更新的应用.
 */
export async function requestBulkUpgradeAll(): Promise<number> {
  const items = collectUpgradableItems();
  if (items.length === 0) return 0;
  log.info(`requestBulkUpgradeAll: ${items.length} apps`);
  try {
    openBulkUpgrade(items);
  } catch (err: any) {
    log.warn("openBulkUpgrade failed:", err instanceof Error ? err.message : err);
    return 0;
  }
  try {
    if (window.api && typeof window.api.bulkUpgradeStart === "function") {
      await window.api.bulkUpgradeStart(items);
    }
  } catch (err: any) {
    log.warn("bulkUpgradeStart failed:", err instanceof Error ? err.message : err);
  }
  return items.length;
}
