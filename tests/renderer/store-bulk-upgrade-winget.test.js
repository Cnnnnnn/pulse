/**
 * tests/renderer/store-bulk-upgrade-winget.test.js
 *
 * P3: isUpgradableSource 接受 winget_show + BulkUpgradeModal SOURCE_LABELS
 * 包含 winget_show (跟 store-bulk-upgrade.js 的 isUpgradableSource 对齐).
 *
 * Behavior-level tests — NOT source-text grep. 验证函数返回值,
 * 跟未来重构源码不耦合.
 */
import { describe, it, expect } from 'vitest';
import { isUpgradableSource } from '../../src/renderer/store/store-bulk-upgrade.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('store-bulk-upgrade — isUpgradableSource (P3 winget_show)', () => {
  it('winget_show 是 upgradable (回归 P3)', () => {
    expect(isUpgradableSource('winget_show')).toBe(true);
  });

  it('原有 upgradable sources 不变 (回归保护)', () => {
    const existing = [
      'brew_formulae',
      'brew_local_cask',
      'sparkle_appcast',
      'app_store_lookup',
      'electron_yml',
      'qclaw_api',
      'app_update_yml',
      'api_json',
    ];
    for (const s of existing) {
      expect(isUpgradableSource(s)).toBe(true);
    }
  });

  it('redirect_filename / cursor_redirect 仍不可升级', () => {
    expect(isUpgradableSource('redirect_filename')).toBe(false);
    expect(isUpgradableSource('cursor_redirect')).toBe(false);
  });

  it('未知 source 返回 false', () => {
    expect(isUpgradableSource('totally_made_up')).toBe(false);
    expect(isUpgradableSource(undefined)).toBe(false);
    expect(isUpgradableSource(null)).toBe(false);
  });
});

describe('BulkUpgradeModal — SOURCE_LABELS (P3 winget_show)', () => {
  // SOURCE_LABELS 不是 exported 也不是 module-level function — 用源码静态分析
  // 验证常量定义存在. 这是 SOURCE_LABELS 本身的 contract, 跟实现细节无关.
  it('SOURCE_LABELS 包含 winget_show → "winget" 标签', () => {
    const src = readFileSync(
      join(__dirname, '../../src/renderer/components/BulkUpgradeModal.jsx'),
      'utf-8',
    );
    expect(src).toMatch(/winget_show:\s*['"]winget['"]/);
  });

  it('NON_UPGRADABLE 集合不含 winget_show (winget 是可升级路径)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/renderer/components/BulkUpgradeModal.jsx'),
      'utf-8',
    );
    const match = src.match(/const NON_UPGRADABLE = new Set\(([^)]+)\)/);
    expect(match).toBeTruthy();
    expect(match[1]).not.toMatch(/winget_show/);
  });
});
