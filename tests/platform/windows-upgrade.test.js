/**
 * tests/platform/windows-upgrade.test.js
 *
 * P3: platform/windows.js getUpgradeAction + execUpgrade 真实实现.
 * 委托给 bulk-upgrade-actions.getActionForApp + bulk-upgrade.defaultExec,
 * 跟 macos.js 同形契约. 由于 require.cache 时序问题 (跟 windows-detection.test.js
 * 同因), vi.mock 不可靠, 改用 require.cache 注入 stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const actionsPath = require.resolve('../../src/main/bulk-upgrade-actions.js');
const bulkPath = require.resolve('../../src/main/bulk-upgrade.js');
const winPath = require.resolve('../../src/platform/windows.js');

const mockGetActionForApp = vi.fn();
const mockDefaultExec = vi.fn();

describe('platform/windows — getUpgradeAction + execUpgrade (P3)', () => {
  let origActions;
  let origBulk;

  beforeEach(() => {
    // 保存原始模块导出
    origActions = require.cache[actionsPath]
      ? require.cache[actionsPath].exports
      : undefined;
    origBulk = require.cache[bulkPath]
      ? require.cache[bulkPath].exports
      : undefined;

    // 注入 stub: 只暴露测试需要的两个函数, 其它字段保持原样不可达也没关系
    // (windows.js 只 require 这两个具名导出, 不会用到 bulk-upgrade.js 其它方法)
    require.cache[actionsPath] = {
      id: actionsPath,
      filename: actionsPath,
      loaded: true,
      exports: { getActionForApp: mockGetActionForApp, buildAppPath: () => '' },
    };
    require.cache[bulkPath] = {
      id: bulkPath,
      filename: bulkPath,
      loaded: true,
      exports: { defaultExec: mockDefaultExec, runBulkUpgrade: () => {} },
    };

    // 清掉 windows.js 缓存, 让它下一次 require 拿到 stub
    delete require.cache[winPath];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origActions !== undefined) {
      require.cache[actionsPath].exports = origActions;
    } else {
      delete require.cache[actionsPath];
    }
    if (origBulk !== undefined) {
      require.cache[bulkPath].exports = origBulk;
    } else {
      delete require.cache[bulkPath];
    }
    delete require.cache[winPath];
  });

  describe('getUpgradeAction', () => {
    it('委托给 bulk-upgrade-actions.getActionForApp, 字段重映射 (appCfg.winget_id → item.wingetId)', () => {
      const detectResult = {
        name: 'Cursor',
        source: 'winget_show',
      };
      const appCfg = { name: 'Cursor', winget_id: 'Anysphere.Cursor' };
      mockGetActionForApp.mockReturnValueOnce({
        type: 'winget',
        id: 'Anysphere.Cursor',
      });

      const win = require('../../src/platform/windows.js');
      const action = win.getUpgradeAction(appCfg, detectResult);

      expect(mockGetActionForApp).toHaveBeenCalledTimes(1);
      expect(mockGetActionForApp).toHaveBeenCalledWith({
        id: 'Cursor',
        name: 'Cursor',
        source: 'winget_show',
        wingetId: 'Anysphere.Cursor',
      });
      expect(action).toEqual({ type: 'winget', id: 'Anysphere.Cursor' });
    });

    it('appCfg 缺 winget_id → item.wingetId undefined (bulk-upgrade-actions 自己处理 missing id)', () => {
      const detectResult = { name: 'X', source: 'winget_show' };
      const appCfg = { name: 'X' };
      mockGetActionForApp.mockReturnValueOnce({
        type: 'none',
        reason: 'winget: missing id',
      });

      const win = require('../../src/platform/windows.js');
      const action = win.getUpgradeAction(appCfg, detectResult);

      expect(mockGetActionForApp).toHaveBeenCalledWith({
        id: 'X',
        name: 'X',
        source: 'winget_show',
        wingetId: undefined,
      });
      expect(action.type).toBe('none');
    });

    it('非 winget source → 返回 { type: "none", reason } (无自动升级路径)', () => {
      const detectResult = { id: 'sparkle-app', name: 'SparkleApp', source: 'sparkle_appcast' };
      const appCfg = { name: 'SparkleApp' };
      mockGetActionForApp.mockReturnValueOnce({
        type: 'none',
        reason: "source 'sparkle_appcast' has no auto-upgrade",
      });

      const win = require('../../src/platform/windows.js');
      const action = win.getUpgradeAction(appCfg, detectResult);

      expect(mockGetActionForApp).toHaveBeenCalledWith({
        id: 'SparkleApp',
        name: 'SparkleApp',
        source: 'sparkle_appcast',
        wingetId: undefined,
      });
      expect(action.type).toBe('none');
      expect(action.reason).toMatch(/sparkle_appcast/);
    });
  });

  describe('execUpgrade', () => {
    it('委托给 bulk-upgrade.defaultExec, 透传 action', async () => {
      const action = { type: 'winget', id: 'Anysphere.Cursor' };
      mockDefaultExec.mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const win = require('../../src/platform/windows.js');
      const result = await win.execUpgrade(action);

      expect(mockDefaultExec).toHaveBeenCalledTimes(1);
      expect(mockDefaultExec).toHaveBeenCalledWith(action);
      expect(result).toEqual({ ok: true, exitCode: 0, stdout: '', stderr: '' });
    });

    it('defaultExec 抛错 → execUpgrade 透传 rejection', async () => {
      const action = { type: 'winget', id: 'Broken.Id' };
      mockDefaultExec.mockRejectedValueOnce(new Error('winget not on PATH'));

      const win = require('../../src/platform/windows.js');
      await expect(win.execUpgrade(action)).rejects.toThrow('winget not on PATH');
    });
  });
});
