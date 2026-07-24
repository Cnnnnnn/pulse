/**
 * tests/platform/macos.test.js
 *
 * macos.js 是现有逻辑的 facade — 验证委托正确, 不重测底层 (那些有各自的测试).
 * 重点: resolveAppPath / getWindowOptions / getUpgradeAction 这几个纯函数能直测;
 *       getInstalledVersion / getAppIcon / execUpgrade 委托到底层模块 (验 spy 调用).
 */
import { describe, it, expect, vi } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const macos = requirePlatform('macos');

describe('platform/macos', () => {
  describe('resolveAppPath', () => {
    it('裸 bundle 名 → /Applications/<bundle>', () => {
      expect(macos.resolveAppPath('Cursor.app')).toBe('/Applications/Cursor.app');
    });

    it('绝对路径 → 原样返回', () => {
      expect(macos.resolveAppPath('/Custom/Path/App.app')).toBe('/Custom/Path/App.app');
    });

    it('空 / null → null', () => {
      expect(macos.resolveAppPath(null)).toBeNull();
      expect(macos.resolveAppPath('')).toBeNull();
      expect(macos.resolveAppPath('   ')).toBeNull();
    });

    it('忽略 appCfg 第二参数 (mac 不需要)', () => {
      expect(macos.resolveAppPath('Cursor.app', { win_bundle: 'Cursor' })).toBe(
        '/Applications/Cursor.app',
      );
    });
  });

  describe('getWindowOptions', () => {
    it('返回 vibrancy + hiddenInset + transparent (跟现有 window.js 一致)', () => {
      const opts = macos.getWindowOptions();
      expect(opts.titleBarStyle).toBe('hiddenInset');
      expect(opts.vibrancy).toBe('under-window');
      expect(opts.visualEffectState).toBe('active');
      expect(opts.transparent).toBe(true);
    });

    it('返回 skipTaskbar: false (Cmd+Tab 可见)', () => {
      expect(macos.getWindowOptions().skipTaskbar).toBe(false);
    });
  });

  describe('getUpgradeAction', () => {
    it('brew_formulae source → brew action (委托 bulk-upgrade-actions)', () => {
      const detectResult = {
        source: 'brew_formulae',
        brew_cask: 'cursor',
        bundle: 'Cursor.app',
        name: 'Cursor',
      };
      const action = macos.getUpgradeAction({}, detectResult);
      expect(action.type).toBe('brew');
      expect(action.args).toEqual(['upgrade', '--cask', 'cursor']);
    });

    it('app_store_lookup source → mas action', () => {
      const action = macos.getUpgradeAction(
        {},
        { source: 'app_store_lookup', track_id: 6737188438, name: 'IMA' },
      );
      expect(action.type).toBe('mas');
      expect(action.trackId).toBe(6737188438);
    });

    it('未知 source → none', () => {
      const action = macos.getUpgradeAction({}, { source: 'unknown_src' });
      expect(action.type).toBe('none');
    });
  });

  describe('getInstalledVersion (委托 installed-version.js)', () => {
    it('调底层 getInstalledVersion, 传 bundle + version_sources', async () => {
      const spy = vi.fn().mockResolvedValue('3.6.31');
      const iv = require('../../src/workers/installed-version.js');
      const orig = iv.getInstalledVersion;
      iv.getInstalledVersion = spy;
      try {
        const v = await macos.getInstalledVersion({
          bundle: 'Cursor.app',
          version_sources: [{ type: 'plist', platform: 'mac' }],
        });
        expect(v).toBe('3.6.31');
        expect(spy).toHaveBeenCalledWith('Cursor.app', [
          { type: 'plist', platform: 'mac' },
        ]);
      } finally {
        iv.getInstalledVersion = orig;
      }
    });
  });

  describe('getAppIcon (委托 app-icon.js)', () => {
    it('调底层 getAppIcon', async () => {
      const spy = vi.fn().mockResolvedValue('data:image/png;base64,xxx');
      const ai = requireMain('app-icon');
      const orig = ai.getAppIcon;
      ai.getAppIcon = spy;
      try {
        const r = await macos.getAppIcon('/Applications/Cursor.app');
        expect(r).toBe('data:image/png;base64,xxx');
        expect(spy).toHaveBeenCalledWith('/Applications/Cursor.app');
      } finally {
        ai.getAppIcon = orig;
      }
    });
  });

  describe('execUpgrade (委托 bulk-upgrade.js defaultExec)', () => {
    it('调底层 defaultExec', async () => {
      const spy = vi.fn().mockResolvedValue({ output: 'done' });
      const bu = requireMain('bulk-upgrade');
      const orig = bu.defaultExec;
      bu.defaultExec = spy;
      try {
        const r = await macos.execUpgrade({ type: 'brew', cmd: 'brew', args: [] });
        expect(r.output).toBe('done');
        expect(spy).toHaveBeenCalledWith({ type: 'brew', cmd: 'brew', args: [] });
      } finally {
        bu.defaultExec = orig;
      }
    });
  });
});
