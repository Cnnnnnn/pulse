/**
 * src/renderer/components/BulkUpgradeModal.jsx
 *
 * 一键批量升级弹窗 (Phase 22).
 *
 * Spec §5.2 modal:
 *   - 标题 "批量升级 (N 个应用)"
 *   - 分组: 按 source 分 section
 *   - 每行: checkbox + name + current→latest + 状态
 *   - 状态: pending / running / done / failed / skipped
 *   - 失败行带 Retry
 *   - 底部: 取消 + "升级 N 个应用" (主按钮)
 *
 * 数据流:
 *   - store-bulk-upgrade.js 提供 signals (items, statuses, summary, ...)
 *   - 弹窗本身只读 + 触发 action
 */

import { useState } from 'preact/hooks';
import {
  bulkUpgradeModalOpen,
  bulkUpgradeItems,
  bulkUpgradeStatuses,
  bulkUpgradeRunning,
  bulkUpgradeDoneCount,
  bulkUpgradeSummary,
  bulkUpgradeOutput,
  bulkUpgradeErrors,
  closeBulkUpgrade,
} from '../store-bulk-upgrade.js';
import { taggedLog } from '../log.js';

const log = taggedLog("[bulk-upgrade]");

const SOURCE_LABELS = {
  brew_formulae:    'brew',
  brew_local_cask:  'brew',
  sparkle_appcast:  'sparkle',
  app_store_lookup: 'App Store',
  electron_yml:     'electron',
  qclaw_api:        'qclaw',
  app_update_yml:   'auto',
  api_json:         'api',
  redirect_filename: 'manual',
  cursor_redirect:   'manual',
  winget_show:      'winget', // P3: Windows 端 winget 升级
};

// P3: 主按钮 + footer 文案按平台分支. macOS 默认 'brew upgrade', Windows 'winget upgrade'.
// platformInfo 由 preload.js (P1) 注入到 window.
const PLATFORM = (typeof window !== 'undefined'
  && window.platformInfo
  && window.platformInfo.platform) || 'darwin';
const UPGRADE_VERB = PLATFORM === 'win32' ? 'winget upgrade' : 'brew upgrade';

// 不可升级的源 (跟 store-bulk-upgrade.js 的 isUpgradableSource 对齐)
const NON_UPGRADABLE = new Set(['redirect_filename', 'cursor_redirect']);

const STATUS_TEXT = {
  pending:   '等待',
  running:   '升级中…',
  done:      '完成',
  failed:    '失败',
  skipped:   '无自动升级',
  cancelled: '已取消',
};

const STATUS_ICON = {
  pending:   '·',
  running:   '↻',
  done:      '✓',
  failed:    '✗',
  skipped:   '—',
  cancelled: '⊘',
};

export function BulkUpgradeModal() {
  if (!bulkUpgradeModalOpen.value) return null;

  const items = bulkUpgradeItems.value;
  const statuses = bulkUpgradeStatuses.value;
  const running = bulkUpgradeRunning.value;
  const summary = bulkUpgradeSummary.value;
  const doneCount = bulkUpgradeDoneCount.value;

  // 默认全选 (但只勾选 upgradable 的)
  const initialSelected = new Set(
    items.filter((it) => !NON_UPGRADABLE.has(it.source)).map((it) => it.id)
  );
  const [selected, setSelected] = useState(initialSelected);

  // 分组 by source
  const groups = groupBySource(items);

  const upgradableCount = items.filter((it) => !NON_UPGRADABLE.has(it.source)).length;
  const selectedCount = Array.from(selected).filter((id) =>
    items.find((it) => it.id === id && !NON_UPGRADABLE.has(it.source))
  ).length;

  function toggle(id) {
    if (running) return; // running 时不能改
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function handleStart() {
    if (running || selectedCount === 0) return;
    const toRun = items.filter((it) => selected.has(it.id) && !NON_UPGRADABLE.has(it.source));
    if (toRun.length === 0) return;
    try {
      window.api && window.api.bulkUpgradeStart && window.api.bulkUpgradeStart(toRun);
    } catch (err) {
      log.error("bulkUpgradeStart failed:", err);
    }
  }

  function handleCancel() {
    if (running) {
      try { window.api && window.api.bulkUpgradeCancel && window.api.bulkUpgradeCancel(); } catch { /* noop */ }
    } else {
      closeBulkUpgrade();
    }
  }

  function handleRetry(id) {
    if (running) return;
    const item = items.find((it) => it.id === id);
    if (!item) return;
    try {
      window.api && window.api.bulkUpgradeStart && window.api.bulkUpgradeStart([item]);
    } catch (err) {
      log.error("bulkUpgradeStart retry failed:", err);
    }
  }

  function handleRetryAllFailed() {
    if (running || !summary) return;
    const failed = summary.failed
      .map((f) => items.find((it) => it.id === f.id))
      .filter(Boolean);
    if (failed.length === 0) return;
    try {
      window.api && window.api.bulkUpgradeStart && window.api.bulkUpgradeStart(failed);
    } catch (err) {
      log.error("retry all failed:", err);
    }
  }

  const footerLabel = running
    ? `${UPGRADE_VERB} ${doneCount}/${upgradableCount}`
    : summary
      ? `${summary.succeeded.length} 成功, ${summary.failed.length} 失败, ${summary.skipped.length} 跳过${summary.cancelled ? ' (已取消)' : ''}`
      : `已选 ${selectedCount} / ${upgradableCount}`;

  return (
    <div class="modal-backdrop" onClick={handleCancel}>
      <div class="modal-card bulk-upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>批量升级 ({upgradableCount} 个应用)</h2>
          <button class="btn-close" onClick={closeBulkUpgrade} title="关闭" aria-label="关闭">×</button>
        </div>

        <div class="modal-body">
          {Object.entries(groups).map(([source, list]) => (
            <div class="bulk-group" key={source}>
              <div class="bulk-group-header">
                <span class={`source-tag source-${source}`}>{SOURCE_LABELS[source] || source}</span>
                <span class="bulk-group-count">{list.length}</span>
              </div>
              <div class="bulk-list">
                {list.map((item) => (
                  <BulkRow
                    key={item.id}
                    item={item}
                    status={statuses.get(item.id) || 'pending'}
                    selected={selected.has(item.id)}
                    onToggle={() => toggle(item.id)}
                    running={running}
                    onRetry={() => handleRetry(item.id)}
                    error={bulkUpgradeErrors.value.get(item.id)}
                    output={bulkUpgradeOutput.value.get(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div class="modal-footer">
          <span class="bulk-summary">{footerLabel}</span>
          <div class="modal-footer-buttons">
            <button class="btn btn-ghost" onClick={handleCancel}>
              {running ? '取消' : summary ? '关闭' : '取消'}
            </button>
            {!summary && (
              <button
                class="btn btn-primary"
                onClick={handleStart}
                disabled={running || selectedCount === 0}
              >
                {UPGRADE_VERB} {selectedCount} 个应用
              </button>
            )}
            {summary && summary.failed.length > 0 && !running && (
              <button class="btn btn-secondary" onClick={handleRetryAllFailed}>
                重试 {summary.failed.length} 个失败
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkRow({ item, status, selected, onToggle, running, onRetry, error, output }) {
  const isUpgradable = !NON_UPGRADABLE.has(item.source);

  return (
    <div class={`bulk-row status-${status}`}>
      <input
        type="checkbox"
        class="bulk-checkbox"
        checked={isUpgradable && selected}
        disabled={!isUpgradable || running}
        onChange={onToggle}
        title={isUpgradable ? '选择升级' : '该数据源无自动升级路径'}
      />
      <span class="bulk-name">{item.name}</span>
      <span class="bulk-versions">{item.current} → {item.latest}</span>
      <span class="bulk-status-icon" title={STATUS_TEXT[status] || status}>{STATUS_ICON[status] || '·'}</span>
      <span class="bulk-status-text">{STATUS_TEXT[status] || status}</span>
      {status === 'failed' && !running && (
        <button class="btn btn-ghost btn-sm bulk-retry-btn" onClick={onRetry} title="重试">重试</button>
      )}
      {status === 'failed' && error && (
        <span class="bulk-error" title={error}>!</span>
      )}
      {output && status !== 'pending' && status !== 'running' && (
        <details class="bulk-output">
          <summary>查看日志</summary>
          <pre>{output}</pre>
        </details>
      )}
    </div>
  );
}

function groupBySource(items) {
  const out = {};
  for (const it of items) {
    const k = it.source || 'unknown';
    if (!out[k]) out[k] = [];
    out[k].push(it);
  }
  return out;
}
