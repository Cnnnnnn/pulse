/**
 * tests/renderer/bulk-upgrade-button.test.jsx
 *
 * BulkUpgradeButton 文案 + disabled + click 行为.
 * 4 case: N=0 / N=3 / running / click opens modal.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';

import { results, applyProgress, resetCheck, activeFilter, searchQuery } from '../../src/renderer/store.js';
import {
  openBulkUpgrade,
  bulkUpgradeRunning,
  bulkUpgradeModalOpen,
  bulkUpgradeItems,
  resetBulkUpgrade,
} from '../../src/renderer/store-bulk-upgrade.js';
import { BulkUpgradeButton } from '../../src/renderer/components/BulkUpgradeButton.jsx';

function makeResult(name, hasUpdate) {
  return {
    name,
    bundle: name.toLowerCase() + '.app',
    brew_cask: hasUpdate ? name.toLowerCase() : '',
    installed_version: '1.0.0',
    latest_version: hasUpdate ? '2.0.0' : '1.0.0',
    has_update: hasUpdate,
    status: hasUpdate ? 'update_available' : 'up_to_date',
    source: 'brew_formulae',
    note: '',
  };
}

describe('BulkUpgradeButton', () => {
  beforeEach(() => {
    resetCheck();
    resetBulkUpgrade();
    // 默认无可升级
    results.value = new Map();
  });
  afterEach(() => cleanup());

  it('N=0 → 显示 "All up to date" 且 disabled', () => {
    results.value = new Map([['Cursor', makeResult('Cursor', false)]]);
    const { getByRole } = render(<BulkUpgradeButton />);
    const btn = getByRole('button');
    expect(btn.textContent).toBe('All up to date');
    expect(btn.disabled).toBe(true);
  });

  it('N=3 → 显示 "Upgrade All (3)" 且可点', () => {
    results.value = new Map([
      ['Cursor',   makeResult('Cursor', true)],
      ['Kimi',     makeResult('Kimi', true)],
      ['CodexBar', makeResult('CodexBar', true)],
    ]);
    const { getByRole } = render(<BulkUpgradeButton />);
    const btn = getByRole('button');
    expect(btn.textContent).toBe('Upgrade All (3)');
    expect(btn.disabled).toBe(false);
  });

  it('running → 显示 "Upgrading X/Y..." 且 disabled', () => {
    results.value = new Map([
      ['Cursor', makeResult('Cursor', true)],
      ['Kimi',   makeResult('Kimi', true)],
    ]);
    bulkUpgradeRunning.value = true;
    const { getByRole } = render(<BulkUpgradeButton />);
    const btn = getByRole('button');
    expect(btn.textContent).toMatch(/^Upgrading \d+\/2/);
    expect(btn.disabled).toBe(true);
    bulkUpgradeRunning.value = false; // 还原
  });

  it('click → 调 openBulkUpgrade(items)', () => {
    results.value = new Map([
      ['Cursor', makeResult('Cursor', true)],
      ['Kimi',   makeResult('Kimi', true)],
    ]);
    // 监听 bulkUpgradeModalOpen 变化
    let opened = false;
    const stop = vi.fn();
    const { getByRole } = render(<BulkUpgradeButton />);
    const btn = getByRole('button');

    fireEvent.click(btn);
    // 检查 modal open + items
    // 因为 import 的是 signal, .value 反映最新状态
    expect(bulkUpgradeModalOpen.value).toBe(true);
    // items 至少 2 个
    expect(bulkUpgradeItems.value.length).toBe(2);
    expect(bulkUpgradeItems.value[0].id).toBe('Cursor');
  });

  // Phase 23: filteredResults awareness
  it('tab="已是最新" 过滤后 N=0 → "All up to date" disabled (即便 results 有 upgradable)', () => {
    results.value = new Map([
      ['Cursor',   makeResult('Cursor', true)],
      ['Kimi',     makeResult('Kimi', true)],
    ]);
    activeFilter.value = 'latest'; // 全部都是 up_to_date 才显示
    const { getByRole } = render(<BulkUpgradeButton />);
    const btn = getByRole('button');
    expect(btn.textContent).toBe('All up to date');
    expect(btn.disabled).toBe(true);
  });

  it('search "codex" + tab=update → count 反映过滤后', () => {
    results.value = new Map([
      ['Codex',    makeResult('Codex', true)],
      ['Cursor',   makeResult('Cursor', true)],
      ['CodexBar', makeResult('CodexBar', false)],
    ]);
    activeFilter.value = 'update';
    searchQuery.value = 'codex';
    const { getByRole } = render(<BulkUpgradeButton />);
    const btn = getByRole('button');
    // 过滤后: Codex (has_update + name match) → 1
    expect(btn.textContent).toBe('Upgrade All (1)');
  });
});
