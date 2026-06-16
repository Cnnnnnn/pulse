/**
 * tests/platform/windows.test.js
 *
 * P1: windows.js 全是 stub — 验证每个方法返回安全的 null/default, app 能 boot.
 * P2/P3/P4 会替换这些 stub 为真实实现.
 */
import { describe, it, expect } from 'vitest';

const windows = require('../../src/platform/windows.js');

describe('platform/windows (P1 stubs)', () => {
  describe('resolveAppPath', () => {
    it('P1 stub → null (P2 填注册表查询)', () => {
      expect(
        windows.resolveAppPath('Cursor', { win_bundle: 'Cursor' }),
      ).toBeNull();
    });
    it('空入参 → null', () => {
      expect(windows.resolveAppPath(null)).toBeNull();
      expect(windows.resolveAppPath('')).toBeNull();
    });
  });

  describe('getInstalledVersion', () => {
    it('P1 stub → null (P2 填注册表/winget)', async () => {
      expect(
        await windows.getInstalledVersion({ win_bundle: 'Cursor' }),
      ).toBeNull();
    });
  });

  describe('getAppIcon', () => {
    it('P1 stub → null (P4 填 getFileIcon)', async () => {
      expect(
        await windows.getAppIcon('C:\\Program Files\\Cursor\\Cursor.exe'),
      ).toBeNull();
    });
  });

  describe('getUpgradeAction', () => {
    it('P1 stub → none (P3 填 winget)', () => {
      const action = windows.getUpgradeAction({}, { source: 'winget_show' });
      expect(action.type).toBe('none');
      expect(action.reason).toContain('windows');
    });
  });

  describe('execUpgrade', () => {
    it('P1 stub → reject (P3 填 winget exec)', async () => {
      await expect(windows.execUpgrade({ type: 'winget' })).rejects.toThrow();
    });
  });

  describe('getWindowOptions', () => {
    it('返回 acrylic + hidden titlebar (Win11; Win10 Electron 静默降级)', () => {
      const opts = windows.getWindowOptions();
      expect(opts.titleBarStyle).toBe('hidden');
      expect(opts.backgroundMaterial).toBe('acrylic');
      expect(opts.skipTaskbar).toBe(false);
      // P4 会加 titleBarOverlay
    });
  });
});
