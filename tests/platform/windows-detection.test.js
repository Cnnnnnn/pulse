/**
 * tests/platform/windows-detection.test.js
 *
 * P2: windows.js resolveAppPath + getInstalledVersion 真实实现 (用 win-registry).
 *
 * vi.mock 拦不住 windows.js 模块加载时的 require (跨文件缓存时序). 改用 require.cache
 * 注入 stub, 跟 preload-platform.test.js 同样模式.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const winRegPath = require.resolve('../../src/workers/win-registry');
const ivPath = require.resolve('../../src/workers/installed-version');
const winPath = require.resolve('../../src/platform/windows.js');

const mockQueryAll = vi.fn();

describe('platform/windows P2 detection', () => {
  let origWinReg;
  let origIv;

  beforeEach(() => {
    // 保存原始模块导出
    origWinReg = require.cache[winRegPath] ? require.cache[winRegPath].exports : undefined;
    origIv = require.cache[ivPath] ? require.cache[ivPath].exports : undefined;

    // 注入 stub win-registry
    require.cache[winRegPath] = {
      id: winRegPath,
      filename: winRegPath,
      loaded: true,
      exports: { queryAllUninstallKeys: mockQueryAll, queryRegistryField: vi.fn() },
    };
    // 注入 stub installed-version
    require.cache[ivPath] = {
      id: ivPath,
      filename: ivPath,
      loaded: true,
      exports: { getInstalledVersion: vi.fn() },
    };
    // 清掉 windows.js 缓存让它重新 require stub
    delete require.cache[winPath];
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 还原原始模块
    if (origWinReg !== undefined) {
      require.cache[winRegPath].exports = origWinReg;
    } else {
      delete require.cache[winRegPath];
    }
    if (origIv !== undefined) {
      require.cache[ivPath].exports = origIv;
    } else {
      delete require.cache[ivPath];
    }
    delete require.cache[winPath];
  });

  describe('resolveAppPath', () => {
    it('有 win_bundle → 返回 win_bundle 标记 (非 null)', () => {
      const win = require(winPath);
      const p = win.resolveAppPath(null, { win_bundle: 'Cursor' });
      expect(p).toBe('Cursor');
    });

    it('无 win_bundle → null', () => {
      const win = require(winPath);
      expect(win.resolveAppPath(null, {})).toBeNull();
    });
  });

  describe('getInstalledVersion', () => {
    it('有 version_sources → 委托 installed-version.js', async () => {
      const ivStub = require.cache[ivPath].exports;
      ivStub.getInstalledVersion = vi.fn().mockResolvedValue('3.6.31');
      const win = require(winPath);
      const v = await win.getInstalledVersion({
        win_bundle: 'Cursor',
        version_sources: [{ type: 'registry_version', reg_path: 'X' }],
      });
      expect(v).toBe('3.6.31');
      expect(ivStub.getInstalledVersion).toHaveBeenCalledWith(
        'Cursor',
        [{ type: 'registry_version', reg_path: 'X' }],
      );
    });

    it('无 version_sources → 走注册表全局扫描兜底', async () => {
      mockQueryAll.mockResolvedValue({
        version: '2.5.0',
        installLocation: 'C:\\X',
      });
      const win = require(winPath);
      const v = await win.getInstalledVersion({ win_bundle: 'Cursor' });
      expect(v).toBe('2.5.0');
      expect(mockQueryAll).toHaveBeenCalledWith('Cursor');
    });

    it('兜底也找不到 → null', async () => {
      mockQueryAll.mockResolvedValue(null);
      const win = require(winPath);
      const v = await win.getInstalledVersion({ win_bundle: 'Nope' });
      expect(v).toBeNull();
    });

    it('缺 win_bundle → null', async () => {
      const win = require(winPath);
      const v = await win.getInstalledVersion({});
      expect(v).toBeNull();
    });
  });
});
