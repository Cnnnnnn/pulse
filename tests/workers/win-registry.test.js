/**
 * tests/workers/win-registry.test.js
 *
 * win-registry.js — reg query 读 DisplayVersion / InstallLocation.
 * 测试用 mock execFile 注入预设 reg 输出.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  queryRegistryField,
  parseRegOutput,
  queryAllUninstallKeys,
} from '../../src/workers/win-registry.js';

describe('win-registry', () => {
  describe('parseRegOutput', () => {
    it('从 reg query 输出提取字段值', () => {
      const output = [
        '',
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{GUID}',
        '    DisplayName    REG_SZ    Cursor',
        '    DisplayVersion    REG_SZ    1.0.0',
        '    InstallLocation    REG_SZ    C:\\Users\\me\\AppData\\Local\\Programs\\cursor',
        '',
      ].join('\r\n');
      const fields = parseRegOutput(output);
      expect(fields.DisplayName).toBe('Cursor');
      expect(fields.DisplayVersion).toBe('1.0.0');
      expect(fields.InstallLocation).toBe(
        'C:\\Users\\me\\AppData\\Local\\Programs\\cursor',
      );
    });

    it('多段值 (REG_MULTI_SZ) 取第一段', () => {
      const output = '    Something    REG_MULTI_SZ    a\\0b\\0c';
      expect(parseRegOutput(output).Something).toBe('a');
    });

    it('空输出 → {}', () => {
      expect(parseRegOutput('')).toEqual({});
    });
  });

  describe('queryRegistryField', () => {
    it('指定 reg_path + field → 返回值', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout:
          'HKEY_CURRENT_USER\\Soft\\X\r\n    DisplayVersion    REG_SZ    2.5.1\r\n',
        stderr: '',
      });
      const v = await queryRegistryField('HKCU\\Soft\\X', 'DisplayVersion', {
        _exec: mockExec,
      });
      expect(v).toBe('2.5.1');
      expect(mockExec).toHaveBeenCalledWith(
        'reg',
        expect.arrayContaining(['query', 'HKCU\\Soft\\X']),
        expect.any(Object),
      );
    });

    it('reg 不存在 (ENOENT) → null', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
      const v = await queryRegistryField('HKCU\\X', 'DisplayVersion', {
        _exec: mockExec,
      });
      expect(v).toBeNull();
    });

    it('字段不存在 → null', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: 'HKEY\\X\r\n    Other    REG_SZ    1\r\n',
        stderr: '',
      });
      const v = await queryRegistryField('HKCU\\X', 'DisplayVersion', {
        _exec: mockExec,
      });
      expect(v).toBeNull();
    });
  });

  describe('queryAllUninstallKeys (全局扫描兜底)', () => {
    it('按 DisplayName 匹配 app, 返回 { version, installLocation }', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout:
          'HKEY\\Uninstall\\{GUID}\r\n' +
          '    DisplayName    REG_SZ    Cursor\r\n' +
          '    DisplayVersion    REG_SZ    3.6.31\r\n' +
          '    InstallLocation    REG_SZ    C:\\Cursor\r\n',
        stderr: '',
      });
      const r = await queryAllUninstallKeys('Cursor', { _exec: mockExec });
      expect(r.version).toBe('3.6.31');
      expect(r.installLocation).toBe('C:\\Cursor');
    });

    it('没匹配到 → null', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: 'HKEY\\X\r\n    DisplayName    REG_SZ    OtherApp\r\n',
        stderr: '',
      });
      const r = await queryAllUninstallKeys('Cursor', { _exec: mockExec });
      expect(r).toBeNull();
    });
  });
});
