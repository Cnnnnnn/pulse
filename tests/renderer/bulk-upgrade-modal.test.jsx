/**
 * tests/renderer/bulk-upgrade-modal.test.jsx
 *
 * BulkUpgradeModal 弹窗: 渲染 / checkbox / 进度 / 重试 / 取消.
 * ~10 case.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';

import {
  bulkUpgradeModalOpen,
  bulkUpgradeItems,
  bulkUpgradeStatuses,
  bulkUpgradeRunning,
  bulkUpgradeDoneCount,
  bulkUpgradeSummary,
  bulkUpgradeErrors,
  bulkUpgradeOutput,
  openBulkUpgrade,
  closeBulkUpgrade,
  applyBulkUpgradeProgress,
  applyBulkUpgradeDone,
  resetBulkUpgrade,
} from '../../src/renderer/store/store-bulk-upgrade.js';
import { BulkUpgradeModal } from '../../src/renderer/components/BulkUpgradeModal.jsx';

function makeItem(over) {
  return {
    id: 'cursor',
    name: 'Cursor',
    source: 'brew_formulae',
    current: '3.6.31',
    latest: '3.7.12',
    cask: 'cursor',
    bundleName: 'Cursor',
    trackId: 0,
    ...over,
  };
}

describe('BulkUpgradeModal', () => {
  beforeEach(() => {
    resetBulkUpgrade();
    // mock window.api
    global.window.api = {
      bulkUpgradeStart: vi.fn(),
      bulkUpgradeCancel: vi.fn(),
    };
  });
  afterEach(() => {
    cleanup();
    delete global.window.api;
  });

  it('modal closed → 不渲染', () => {
    bulkUpgradeModalOpen.value = false;
    const { container } = render(<BulkUpgradeModal />);
    expect(container.querySelector('.bulk-upgrade-modal')).toBeNull();
  });

  it('modal open → 渲染 title + 分组', () => {
    openBulkUpgrade([
      makeItem({ id: 'cursor', name: 'Cursor', source: 'brew_formulae' }),
      makeItem({ id: 'kimi', name: 'Kimi', source: 'brew_formulae' }),
      makeItem({ id: 'codexbar', name: 'CodexBar', source: 'sparkle_appcast' }),
      makeItem({ id: 'kimi2', name: 'Kimi 2', source: 'redirect_filename' }), // non-upgradable
    ]);
    const { getByText } = render(<BulkUpgradeModal />);
    expect(getByText(/批量升级 \(/)).toBeTruthy();
    expect(getByText('Cursor')).toBeTruthy();
    expect(getByText('Kimi 2')).toBeTruthy();
    // brew + sparkle + manual 三个 source tag
    expect(getByText('brew')).toBeTruthy();
    expect(getByText('sparkle')).toBeTruthy();
    expect(getByText('manual')).toBeTruthy();
  });

  it('non-upgradable source 的 checkbox disabled', () => {
    openBulkUpgrade([
      makeItem({ id: 'kimi2', name: 'Kimi 2', source: 'redirect_filename' }),
    ]);
    const { container } = render(<BulkUpgradeModal />);
    const cb = container.querySelector('input[type=checkbox]');
    expect(cb.disabled).toBe(true);
  });

  it('点击 checkbox 切换 selected', () => {
    openBulkUpgrade([
      makeItem({ id: 'cursor', name: 'Cursor' }),
      makeItem({ id: 'kimi', name: 'Kimi' }),
    ]);
    const { container } = render(<BulkUpgradeModal />);
    const checkboxes = container.querySelectorAll('input[type=checkbox]');
    expect(checkboxes.length).toBe(2);
    // 初始全选
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(true);
    // 取消一个
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('主按钮 (mac 默认 "brew upgrade N 个应用") 调 api.bulkUpgradeStart (过滤 selected)', () => {
    openBulkUpgrade([
      makeItem({ id: 'cursor', name: 'Cursor' }),
      makeItem({ id: 'kimi', name: 'Kimi' }),
    ]);
    const { getByText, container } = render(<BulkUpgradeModal />);
    // 取消 cursor
    const cb = container.querySelectorAll('input[type=checkbox]')[0];
    fireEvent.click(cb);
    // P3: 按钮文案按平台分支 (mac 默认 'brew upgrade', win 'winget upgrade').
    // jsdom 默认无 window.platformInfo → fallback 到 'darwin' → 'brew upgrade'.
    const btn = getByText(/brew upgrade 1 个应用/);
    fireEvent.click(btn);
    expect(window.api.bulkUpgradeStart).toHaveBeenCalledTimes(1);
    const call = window.api.bulkUpgradeStart.mock.calls[0][0];
    expect(call.length).toBe(1);
    expect(call[0].id).toBe('kimi');
  });

  it('收到 progress 事件 → 行状态更新', async () => {
    openBulkUpgrade([makeItem({ id: 'cursor' })]);
    const { container } = render(<BulkUpgradeModal />);
    applyBulkUpgradeProgress({ id: 'cursor', status: 'running' });
    await tick();
    const row = container.querySelector('.bulk-row');
    expect(row.className).toContain('status-running');
  });

  it('收到 done 事件 → summary 显示', async () => {
    openBulkUpgrade([makeItem({ id: 'cursor' })]);
    const { container, getByText } = render(<BulkUpgradeModal />);
    applyBulkUpgradeProgress({ id: 'cursor', status: 'done' });
    applyBulkUpgradeDone({
      succeeded: [{ id: 'cursor' }],
      failed: [],
      skipped: [],
      cancelled: false,
    });
    await tick();
    expect(getByText(/1 成功, 0 失败/)).toBeTruthy();
  });

  it('failed 行带 重试 按钮', async () => {
    openBulkUpgrade([makeItem({ id: 'cursor' })]);
    applyBulkUpgradeProgress({ id: 'cursor', status: 'failed', error: 'boom' });
    applyBulkUpgradeDone({
      succeeded: [],
      failed: [{ id: 'cursor', error: 'boom' }],
      skipped: [],
      cancelled: false,
    });
    const { getByText } = render(<BulkUpgradeModal />);
    await tick();
    expect(getByText('重试')).toBeTruthy();
  });

  it('click 重试 → 调 api.bulkUpgradeStart (单个 item)', async () => {
    openBulkUpgrade([makeItem({ id: 'cursor' })]);
    applyBulkUpgradeProgress({ id: 'cursor', status: 'failed', error: 'boom' });
    applyBulkUpgradeDone({
      succeeded: [],
      failed: [{ id: 'cursor', error: 'boom' }],
      skipped: [],
      cancelled: false,
    });
    const { getByText } = render(<BulkUpgradeModal />);
    await tick();
    const btn = getByText('重试');
    fireEvent.click(btn);
    expect(window.api.bulkUpgradeStart).toHaveBeenCalledTimes(1);
    const call = window.api.bulkUpgradeStart.mock.calls[0][0];
    expect(call.length).toBe(1);
    expect(call[0].id).toBe('cursor');
  });

  it('running 时 取消 调 api.bulkUpgradeCancel', async () => {
    openBulkUpgrade([makeItem({ id: 'cursor' })]);
    bulkUpgradeRunning.value = true;
    const { getByText } = render(<BulkUpgradeModal />);
    await tick();
    fireEvent.click(getByText('取消'));
    expect(window.api.bulkUpgradeCancel).toHaveBeenCalledTimes(1);
  });

  it('close 按钮调 closeBulkUpgrade', async () => {
    openBulkUpgrade([makeItem({ id: 'cursor' })]);
    const { container } = render(<BulkUpgradeModal />);
    await tick();
    const closeBtn = container.querySelector('.btn-close');
    fireEvent.click(closeBtn);
    expect(bulkUpgradeModalOpen.value).toBe(false);
  });

  it('progress 事件 done → doneCount 自增', async () => {
    openBulkUpgrade([
      makeItem({ id: 'cursor' }),
      makeItem({ id: 'kimi' }),
    ]);
    render(<BulkUpgradeModal />);
    applyBulkUpgradeProgress({ id: 'cursor', status: 'done' });
    await tick();
    expect(bulkUpgradeDoneCount.value).toBe(1);
    applyBulkUpgradeProgress({ id: 'kimi', status: 'failed', error: 'x' });
    await tick();
    expect(bulkUpgradeDoneCount.value).toBe(2);
  });
});

// preact signals 批量更新, 等一个 microtask flush
function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
