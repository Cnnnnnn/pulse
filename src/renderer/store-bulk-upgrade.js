/**
 * src/renderer/store-bulk-upgrade.js
 *
 * Bulk Upgrade 的 UI 状态. 独立 signal store, 避免污染 store.js.
 *
 * Signals:
 *   - bulkUpgradeModalOpen: bool    modal 是否打开
 *   - bulkUpgradeItems: Array       待升级项 (renderer 选好后灌进来)
 *   - bulkUpgradeStatuses: Map      per-id status ('pending'|'running'|'done'|'failed'|'skipped'|'cancelled')
 *   - bulkUpgradeRunning: bool      是否有批正在跑
 *   - bulkUpgradeDoneCount: number  已 done 的数量 (running 时按钮显示 X/Y)
 *   - bulkUpgradeSummary: object|null  完成后汇总
 *   - bulkUpgradeOutput: Map        per-id 命令输出 (供 "view output" 展开)
 *   - bulkUpgradeErrors: Map        per-id 错误 message
 */

import { signal, computed } from '@preact/signals';

export const bulkUpgradeModalOpen = signal(false);
export const bulkUpgradeItems = signal([]);
export const bulkUpgradeStatuses = signal(new Map());
export const bulkUpgradeRunning = signal(false);
export const bulkUpgradeDoneCount = signal(0);
export const bulkUpgradeSummary = signal(null);
export const bulkUpgradeOutput = signal(new Map());
export const bulkUpgradeErrors = signal(new Map());

// 重置回 idle 状态 (modal 关闭时)
export function resetBulkUpgrade() {
  bulkUpgradeItems.value = [];
  bulkUpgradeStatuses.value = new Map();
  bulkUpgradeRunning.value = false;
  bulkUpgradeDoneCount.value = 0;
  bulkUpgradeSummary.value = null;
  bulkUpgradeOutput.value = new Map();
  bulkUpgradeErrors.value = new Map();
}

// 打开 modal: 由 BulkUpgradeButton click 触发
export function openBulkUpgrade(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  // 重置再开
  resetBulkUpgrade();
  bulkUpgradeItems.value = items;
  // 初始状态: 全 pending (除了 source 不可升级的会标 skipped)
  const statuses = new Map();
  items.forEach((it) => {
    if (isUpgradableSource(it.source)) {
      statuses.set(it.id, 'pending');
    } else {
      statuses.set(it.id, 'skipped');
    }
  });
  bulkUpgradeStatuses.value = statuses;
  bulkUpgradeModalOpen.value = true;
}

export function closeBulkUpgrade() {
  // 如果在跑, 先发 cancel
  if (bulkUpgradeRunning.value) {
    try { window.api && window.api.bulkUpgradeCancel && window.api.bulkUpgradeCancel(); } catch { /* noop */ }
  }
  bulkUpgradeModalOpen.value = false;
  // 注意: 不调 resetBulkUpgrade, 保留 summary 给用户看 (modal 还在显示 done 状态)
  // 下次 openBulkUpgrade 会 reset
}

// 进度事件回调 (注册到 api.onBulkUpgradeProgress)
export function applyBulkUpgradeProgress(evt) {
  if (!evt || !evt.id) return;
  const next = new Map(bulkUpgradeStatuses.value);
  next.set(evt.id, evt.status);
  bulkUpgradeStatuses.value = next;

  // running 状态切到 true
  if (evt.status === 'running' && !bulkUpgradeRunning.value) {
    bulkUpgradeRunning.value = true;
  }
  // done / failed / skipped 都算完成
  if (evt.status === 'done' || evt.status === 'failed' || evt.status === 'skipped') {
    bulkUpgradeDoneCount.value = bulkUpgradeDoneCount.value + 1;
  }
  // 错误信息
  if (evt.status === 'failed' && evt.error) {
    const e = new Map(bulkUpgradeErrors.value);
    e.set(evt.id, evt.error);
    bulkUpgradeErrors.value = e;
  }
  // 输出 (限制大小, 避免撑爆内存)
  if (typeof evt.output === 'string' && evt.output.length > 0) {
    const o = new Map(bulkUpgradeOutput.value);
    o.set(evt.id, evt.output.length > 4096 ? evt.output.slice(0, 4096) + '…' : evt.output);
    bulkUpgradeOutput.value = o;
  }
}

// 完成事件回调 (注册到 api.onBulkUpgradeDone)
export function applyBulkUpgradeDone(summary) {
  bulkUpgradeRunning.value = false;
  bulkUpgradeSummary.value = summary || { succeeded: [], failed: [], skipped: [], cancelled: false };
}

// 工具: 判断 source 是否有可执行升级路径
function isUpgradableSource(src) {
  return src === 'brew_formulae'
    || src === 'brew_local_cask'
    || src === 'sparkle_appcast'
    || src === 'app_store_lookup'
    || src === 'electron_yml'
    || src === 'qclaw_api'
    || src === 'app_update_yml'
    || src === 'api_json';
}
