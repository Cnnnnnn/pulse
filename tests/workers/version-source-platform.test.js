/**
 * tests/workers/version-source-platform.test.js
 *
 * Windows source types: registry_version / winget_list / windows_app_yml.
 * 用 mock exec / mock fs 注入, 不依赖真实 Windows.
 */
import { describe, it, expect, vi } from 'vitest';
import { tryVersionSource } from '../../src/workers/version-source.js';

describe('version-source Windows types', () => {
  describe('registry_version', () => {
    it('指定 reg_path → 读 DisplayVersion', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: 'HKCU\\X\r\n    DisplayVersion    REG_SZ    3.6.31\r\n',
        stderr: '',
      });
      const v = await tryVersionSource(
        { type: 'registry_version', reg_path: 'HKCU\\X' },
        { _exec: mockExec },
      );
      expect(v).toBe('3.6.31');
    });

    it('reg 失败 → null', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
      const v = await tryVersionSource(
        { type: 'registry_version', reg_path: 'HKCU\\X' },
        { _exec: mockExec },
      );
      expect(v).toBeNull();
    });

    it('缺 reg_path → null', async () => {
      const v = await tryVersionSource({ type: 'registry_version' }, {});
      expect(v).toBeNull();
    });
  });

  describe('winget_list', () => {
    it('winget list --id 输出版本', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout:
          'Name       Id              Version  Available  Source\nCursor  Anysphere.Cursor  1.0.0   1.0.1     winget',
        stderr: '',
      });
      const v = await tryVersionSource(
        { type: 'winget_list', winget_id: 'Anysphere.Cursor' },
        { _exec: mockExec },
      );
      expect(v).toBe('1.0.0');
    });

    it('winget 没装 → null', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
      const v = await tryVersionSource(
        { type: 'winget_list', winget_id: 'X' },
        { _exec: mockExec },
      );
      expect(v).toBeNull();
    });
  });

  describe('windows_app_yml', () => {
    it('读 app-update.yml 的 version', async () => {
      const mockFs = {
        promises: {
          readFile: vi.fn().mockResolvedValue('version: 2.5.0\n'),
        },
      };
      const v = await tryVersionSource(
        { type: 'windows_app_yml', path: 'C:\\Cursor\\app-update.yml' },
        { _fs: mockFs },
      );
      expect(v).toBe('2.5.0');
    });

    it('文件不存在 → null', async () => {
      const mockFs = {
        promises: {
          readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
        },
      };
      const v = await tryVersionSource(
        { type: 'windows_app_yml', path: 'C:\\X' },
        { _fs: mockFs },
      );
      expect(v).toBeNull();
    });
  });

  describe('mac source types 仍正常 (回归)', () => {
    it('plist source 不受影响', async () => {
      const v = await tryVersionSource(
        { type: 'plist' },
        {
          plistRaw:
            '<key>CFBundleShortVersionString</key><string>1.2.3</string>',
        },
      );
      expect(v).toBe('1.2.3');
    });
  });
});
