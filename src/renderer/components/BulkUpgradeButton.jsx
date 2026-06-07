/**
 * src/renderer/components/BulkUpgradeButton.jsx
 *
 * 顶部 "Upgrade All (N)" 按钮.
 * Phase 23: N 反映 filteredResults (search + tab 过滤后) 的 upgradable 数.
 *  click → 打开 BulkUpgradeModal (只装过滤后的 items).
 *
 * 状态文案 (per spec §5.1):
 *   N > 0:        "Upgrade All (N)"  primary, 可点
 *   N = 0:        "All up to date"   ghost, disabled
 *   running:      "Upgrading 3/7..."  primary, disabled, 显示进度
 */

import { results } from '../store.js';
import { filteredResults } from '../selectors.js';
import {
  openBulkUpgrade,
  bulkUpgradeRunning,
  bulkUpgradeDoneCount,
} from '../store-bulk-upgrade.js';

export function BulkUpgradeButton() {
  // Phase 23: 用 filteredResults 算 N — tab="已是最新" 时 N=0 (因为全都不是 upgradable)
  // 这样 "All up to date" 跟用户的 filter 意图一致
  const visibleResults = Array.from(filteredResults.value.values());
  const upgradable = visibleResults.filter((r) => r && r.has_update);
  const total = upgradable.length;

  // running 状态由 store-bulk-upgrade.js 提供 (preact signals 自动重渲染)
  const running = bulkUpgradeRunning.value;
  const doneCount = bulkUpgradeDoneCount.value;

  if (total === 0 && !running) {
    return (
      <button
        id="btn-upgrade"
        class="btn btn-primary"
        disabled
        title="当前无可升级应用"
      >
        All up to date
      </button>
    );
  }

  if (running) {
    return (
      <button
        id="btn-upgrade"
        class="btn btn-primary"
        disabled
        title="正在升级"
      >
        Upgrading {doneCount}/{total}...
      </button>
    );
  }

  return (
    <button
      id="btn-upgrade"
      class="btn btn-primary"
      onClick={() => openBulkUpgrade(upgradable.map(toBulkItem))}
      title="一键升级所有可升级应用"
    >
      Upgrade All ({total})
    </button>
  );
}

/**
 * 把 result 转换成 bulk-upgrade item (spec §8).
 * 注意: bundleName 默认用 result.name, 符合 buildAppPath(name) 习惯.
 * releaseUrl 来自 sparkle 的 <enclosure url="..."> (Phase 22).
 */
function toBulkItem(r) {
  return {
    id: r.name,
    name: r.name,
    source: r.source || '',
    current: r.installed_version || '',
    latest: r.latest_version || '',
    cask: r.brew_cask || '',
    bundleName: r.name, // /Applications/<name>.app
    trackId: r.track_id || r.trackId || 0,
    releaseUrl: r.release_url || r.releaseUrl || '',
  };
}
